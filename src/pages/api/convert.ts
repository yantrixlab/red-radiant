import type { APIRoute } from 'astro';
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { randomUUID } from 'crypto';
import { getYtDlp, getCookieArgs, ffmpegConvert, ffmpegPath, nodeToWebStream, cleanup, extractVideoId, jsonRes } from '../../lib/ytdlp.server';

export const prerender = false;

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return fetchJson(res.headers.location!).then(resolve).catch(reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad JSON')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function downloadUrl(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    const get = (u: string) => {
      const req = lib.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return get(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
    };
    get(url);
  });
}

// ── Piped instances ────────────────────────────────────────────────────────────
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.yt',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.adminforge.de',
];

// ── Invidious instances ────────────────────────────────────────────────────────
const INVIDIOUS = [
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
  'https://invidious.nerdvpn.de',
  'https://invidious.fdn.fr',
  'https://inv.tux.pizza',
];

async function getAudioUrlFromPiped(videoId: string): Promise<string | null> {
  for (const host of PIPED) {
    try {
      const data = await fetchJson(`${host}/streams/${videoId}`);
      const streams: any[] = data.audioStreams ?? [];
      if (!streams.length) continue;
      streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      if (streams[0]?.url) { console.log(`[piped] OK: ${host}`); return streams[0].url; }
    } catch (e: any) { console.warn(`[piped] ${host}: ${e.message}`); }
  }
  return null;
}

async function getAudioUrlFromInvidious(videoId: string): Promise<string | null> {
  for (const host of INVIDIOUS) {
    try {
      const data = await fetchJson(`${host}/api/v1/videos/${videoId}?fields=adaptiveFormats`);
      const formats: any[] = data.adaptiveFormats ?? [];
      const audio = formats
        .filter((f: any) => f.type?.startsWith('audio/'))
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      if (audio[0]?.url) { console.log(`[invidious] OK: ${host}`); return audio[0].url; }
    } catch (e: any) { console.warn(`[invidious] ${host}: ${e.message}`); }
  }
  return null;
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
    // ── Step 1: try Piped ────────────────────────────────────────────────────
    console.log(`[convert] videoId=${videoId} format=${format} quality=${quality}`);
    let audioUrl = await getAudioUrlFromPiped(videoId);
    if (!audioUrl) console.log('[convert] All Piped instances failed');

    // ── Step 2: try Invidious ─────────────────────────────────────────────
    if (!audioUrl) audioUrl = await getAudioUrlFromInvidious(videoId);
    if (!audioUrl) console.log('[convert] All Invidious instances failed');

    // ── Step 3: fall back to yt-dlp with proxy ────────────────────────────
    if (!audioUrl) {
      console.log('[ytdlp] Falling back to yt-dlp…');
      const ytDlp = await getYtDlp();
      const inputTpl = path.join(tmpDir, `ytdl_${tmpId}.%(ext)s`);

      const proxy = process.env.YT_PROXY ?? '';
      await ytDlp.execPromise([
        `https://www.youtube.com/watch?v=${videoId}`,
        '-f', 'bestaudio/bestaudio*[ext=m4a]/bestaudio*[ext=webm]/best',
        '--no-playlist',
        '--ffmpeg-location', path.dirname(ffmpegPath),
        '-o', inputTpl,
        '--no-warnings',
        '--extractor-args', 'youtube:player_client=tv_embedded,ios,web',
        ...getCookieArgs(),
        ...(proxy ? ['--proxy', proxy] : []),
      ]);

      const inputFile = fs.readdirSync(tmpDir)
        .map(f => path.join(tmpDir, f))
        .find(f => f.includes(`ytdl_${tmpId}.`) && !f.endsWith('.part'));
      if (!inputFile) throw new Error('yt-dlp produced no output file');

      await ffmpegConvert(inputFile, outputFile, format, quality);
      cleanup(inputFile);

      const fileSize   = fs.statSync(outputFile).size;
      const fileStream = fs.createReadStream(outputFile);
      fileStream.on('close', () => setTimeout(() => cleanup(outputFile), 10_000));
      const contentType = format === 'wav' ? 'audio/wav' : format === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
      return new Response(nodeToWebStream(fileStream), {
        status: 200,
        headers: {
          'Content-Type': contentType, 'Content-Length': String(fileSize),
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'X-Filename': filename, 'Cache-Control': 'no-store',
        },
      });
    }

    // ── Download audio URL from Piped/Invidious ───────────────────────────
    console.log('[download] Fetching audio stream…');
    await downloadUrl(audioUrl, rawFile);

    console.log(`[ffmpeg] Converting to ${format}…`);
    await ffmpegConvert(rawFile, outputFile, format, quality);
    cleanup(rawFile);

    const fileSize   = fs.statSync(outputFile).size;
    const fileStream = fs.createReadStream(outputFile);
    fileStream.on('close', () => setTimeout(() => cleanup(outputFile), 10_000));
    const contentType = format === 'wav' ? 'audio/wav' : format === 'm4a' ? 'audio/mp4' : 'audio/mpeg';

    return new Response(nodeToWebStream(fileStream), {
      status: 200,
      headers: {
        'Content-Type': contentType, 'Content-Length': String(fileSize),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'X-Filename': filename, 'Cache-Control': 'no-store',
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
