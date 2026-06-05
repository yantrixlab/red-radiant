import type { APIRoute } from 'astro';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import ytdl from '@distube/ytdl-core';
import { ffmpegConvert, nodeToWebStream, cleanup, extractVideoId, jsonRes } from '../../lib/ytdlp.server';

export const prerender = false;

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
    console.log(`[ytdl] Downloading audio for ${videoId}…`);

    const audioStream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
      filter: 'audioonly',
      quality: 'highestaudio',
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        },
      },
    });

    // Save raw audio to file
    await new Promise<void>((resolve, reject) => {
      const write = fs.createWriteStream(rawFile);
      audioStream.pipe(write);
      write.on('finish', resolve);
      write.on('error', reject);
      audioStream.on('error', reject);
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
