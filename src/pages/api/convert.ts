import type { APIRoute } from 'astro';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Innertube } from 'youtubei.js';
import { ffmpegConvert, ffmpegPath, nodeToWebStream, cleanup, extractVideoId, jsonRes } from '../../lib/ytdlp.server';

export const prerender = false;

// Reuse Innertube instance across requests
let _yt: Innertube | null = null;
async function getInnertube() {
  if (!_yt) {
    _yt = await Innertube.create({
      retrieve_player: false,
    });
  }
  return _yt;
}

export const POST: APIRoute = async ({ request, locals: _locals }) => {

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
    console.log(`[innertube] Downloading ${videoId}…`);
    const yt = await getInnertube();

    // Get the best audio stream
    const stream = await yt.download(videoId, {
      type: 'audio',
      quality: 'best',
      client: 'IOS',
    });

    // Write stream to raw file
    const writeStream = fs.createWriteStream(rawFile);
    for await (const chunk of stream) {
      writeStream.write(chunk);
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`[ffmpeg] Converting to ${format}…`);
    await ffmpegConvert(rawFile, outputFile, format, quality);
    cleanup(rawFile);

    const fileSize   = fs.statSync(outputFile).size;
    const fileStream = fs.createReadStream(outputFile);
    fileStream.on('close', () => setTimeout(() => cleanup(outputFile), 10_000));

    const contentType = format === 'wav' ? 'audio/wav'
                      : format === 'm4a' ? 'audio/mp4'
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
