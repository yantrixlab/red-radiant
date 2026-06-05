import type { APIRoute } from 'astro';
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { randomUUID } from 'crypto';
import { ffmpegConvert, nodeToWebStream, cleanup, extractVideoId, jsonRes } from '../../lib/ytdlp.server';

export const prerender = false;

// Multiple Piped instances as fallback
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.yt',
  'https://pipedapi.in.projectsegfau.lt',
];

async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location!).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Piped')); }
      });
    }).on('error', reject);
  });
}

async function downloadUrl(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    const get = (u: string) => lib.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return get(res.headers.location);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
    get(url);
  });
}

async function getAudioUrl(videoId: string): Promise<string> {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`[piped] Trying ${instance}…`);
      const data = await fetchJson(`${instance}/streams/${videoId}`);

      // Find best audio stream
      const audioStreams: any[] = data.audioStreams ?? [];
      if (!audioStreams.length) continue;

      // Sort by bitrate descending
      audioStreams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best = audioStreams[0];
      if (best?.url) {
        console.log(`[piped] Got audio stream from ${instance}, bitrate: ${best.bitrate}`);
        return best.url;
      }
    } catch (e: any) {
      console.warn(`[piped] ${instance} failed: ${e.message}`);
    }
  }
  throw new Error('All Piped instances failed');
}

export const POST: APIRoute = async ({ request }) => {

  let body: { url?: string; format?: string; quality?: string; title?: string };
  try { body = await request.json(); }
  catch { return jsonRes({ error: 'Invalid request body' }, 400); }

  const { url = '', format = 'mp3', quality = '320', title = '' } = body;
  const videoId = extractVideoId(url);
  if (!videoId) return jsonRes({ error: 'Invalid YouTube URL' }, 400);

  const cleanTitle = (title || videoId).replace(/[^\w\s\-().]/g, '').trim();
  const filename   = `${cleanTitle}.${format}`;
  const tmpId      = randomUUID();
  const tmpDir     = os.tmpdir();
  const rawFile    = path.join(tmpDir, `ytdl_raw_${tmpId}`);
  const outputFile = path.join(tmpDir, `ytdl_out_${tmpId}.${format}`);

  try {
    const audioUrl = await getAudioUrl(videoId);

    console.log(`[download] Fetching audio stream…`);
    await downloadUrl(audioUrl, rawFile);

    console.log(`[ffmpeg] Converting to ${format}…`);
    await ffmpegConvert(rawFile, outputFile, format, quality);
    cleanup(rawFile);

    const fileSize   = fs.statSync(outputFile).size;
    const fileStream = fs.createReadStream(outputFile);
    fileStream.on('close', () => setTimeout(() => cleanup(outputFile), 10_000));

    const contentType = format === 'wav'  ? 'audio/wav'
                      : format === 'm4a'  ? 'audio/mp4'
                      : 'audio/mpeg';

    return new Response(nodeToWebStream(fileStream), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'X-Filename': filename,
        'Cache-Control': 'no-store',
      },
    });

  } catch (e: any) {
    cleanup(rawFile, outputFile);
    console.error('[convert error]', e?.message ?? e);
    const msg: string = (e?.message ?? '').toLowerCase();
    return jsonRes({
      error: msg.includes('private')          ? 'private'
           : msg.includes('age-restrict')     ? 'age_restricted'
           : msg.includes('age restricted')   ? 'age_restricted'
           : msg.includes('confirm your age') ? 'age_restricted'
           : msg.includes('not found')        ? 'not_found'
           : msg.includes('unavailable')      ? 'unavailable'
           : 'conversion_failed',
      debug: e?.message ?? String(e),
    }, 500);
  }
};
