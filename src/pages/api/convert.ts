import type { APIRoute } from 'astro';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { getYtDlp, getCookieArgs, ffmpegConvert, ffmpegPath, nodeToWebStream, cleanup, extractVideoId, jsonRes } from '../../lib/ytdlp.server';
export const prerender = false;

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
  const inputTpl   = path.join(tmpDir, `ytdl_${tmpId}.%(ext)s`);
  const outputFile = path.join(tmpDir, `ytdl_out_${tmpId}.${format}`);

  try {
    const ytDlp = await getYtDlp();

    console.log(`[yt-dlp] Downloading ${videoId}…`);
    await ytDlp.execPromise([
      `https://www.youtube.com/watch?v=${videoId}`,
      '-f', 'bestaudio',
      '--no-playlist',
      '--ffmpeg-location', path.dirname(ffmpegPath),
      '-o', inputTpl,
      '--no-warnings',
      ...getCookieArgs(),
    ]);

    const inputFile = fs.readdirSync(tmpDir)
      .map(f => path.join(tmpDir, f))
      .find(f => f.includes(`ytdl_${tmpId}.`) && !f.endsWith('.part'));

    if (!inputFile) throw new Error('Download produced no output file');

    console.log(`[ffmpeg] Converting to ${format}…`);
    await ffmpegConvert(inputFile, outputFile, format, quality);
    cleanup(inputFile);

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
    cleanup(outputFile);
    try {
      fs.readdirSync(tmpDir)
        .filter(f => f.includes(tmpId))
        .forEach(f => cleanup(path.join(tmpDir, f)));
    } catch {}
    console.error('[convert error]', e?.message ?? e);
    const msg: string = (e?.message ?? '').toLowerCase();
    return jsonRes({
      error: msg.includes('private')        ? 'private'
           : msg.includes('age-restrict')   ? 'age_restricted'
           : msg.includes('age restricted') ? 'age_restricted'
           : msg.includes('confirm your age') ? 'age_restricted'
           : msg.includes('not found')      ? 'not_found'
           : msg.includes('unavailable')    ? 'unavailable'
           : 'conversion_failed',
      debug: e?.message ?? String(e),
    }, 500);
  }
};
