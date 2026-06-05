import type { APIRoute } from 'astro';
import { createRequire } from 'module';
import { PassThrough } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { getYtDlp, ffmpegConvert, ffmpegPath, nodeToWebStream, cleanup, jsonRes } from '../../lib/ytdlp.server';
import { checkAndIncrementDownload, getUserUsage, LimitExceeded } from '../../lib/limits.server';

export const prerender = false;

const _require = createRequire(import.meta.url);
const { ZipArchive } = _require('archiver') as { ZipArchive: new (opts?: object) => any };

const MAX_TRACKS = 50;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes({ error: 'login_required' }, 401);

  let body: { url?: string; format?: string; quality?: string };
  try { body = await request.json(); }
  catch { return jsonRes({ error: 'Invalid request' }, 400); }

  const { url = '', format = 'mp3', quality = '320' } = body;
  if (!url) return jsonRes({ error: 'URL required' }, 400);

  const tmpId  = randomUUID();
  const tmpDir = path.join(os.tmpdir(), `yt_playlist_${tmpId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const ytDlp = await getYtDlp();

    // ── Step 1: get list of video IDs (fast, flat, no download) ───────────────
    console.log('[playlist] Fetching video list…');
    const idsRaw: string = await ytDlp.execPromise([
      url,
      '--flat-playlist',
      '--print', '%(id)s|||%(title)s',
      `--playlist-end`, String(MAX_TRACKS),
      '--no-warnings',
      '--quiet',
    ]);

    const entries = idsRaw.trim().split('\n').filter(Boolean).map(line => {
      const [id, ...titleParts] = line.split('|||');
      return { id: id.trim(), title: titleParts.join('|||').trim() || id.trim() };
    });

    if (!entries.length) throw new Error('No videos found in playlist');

    // ── Limit check: cap to however many downloads the user has left ───────────
    let tracksToProcess = entries.length;
    if (locals.user!.plan !== 'premium') {
      const usage = await getUserUsage(locals.user!.uid);
      const available = usage.limit - usage.count;
      if (available <= 0) return jsonRes({ error: 'limit_exceeded', used: usage.count, limit: usage.limit }, 403);
      tracksToProcess = Math.min(entries.length, available);
    }
    const cappedEntries = entries.slice(0, tracksToProcess);
    console.log(`[playlist] ${cappedEntries.length} videos to process`);

    // ── Step 2: download + convert each track ─────────────────────────────────
    const convertedFiles: { file: string; name: string }[] = [];

    // Increment download count for all tracks being processed
    try {
      await checkAndIncrementDownload(locals.user!.uid, cappedEntries.length);
    } catch (e) {
      if (e instanceof LimitExceeded) return jsonRes({ error: 'limit_exceeded', used: e.used, limit: e.limit }, 403);
      throw e;
    }

    for (let i = 0; i < cappedEntries.length; i++) {
      const { id, title } = cappedEntries[i];
      const safeTitle = title.replace(/[^\w\s\-().]/g, '').trim() || id;
      const inputTpl  = path.join(tmpDir, `track_${i}.%(ext)s`);
      const outFile   = path.join(tmpDir, `track_${i}.${format}`);

      console.log(`[playlist] ${i + 1}/${cappedEntries.length}: ${safeTitle}`);
      try {
        await ytDlp.execPromise([
          `https://www.youtube.com/watch?v=${id}`,
          '-f', 'bestaudio',
          '--no-playlist',
          '--ffmpeg-location', path.dirname(ffmpegPath),
          '-o', inputTpl,
          '--no-warnings',
        ]);

        const inputFile = fs.readdirSync(tmpDir)
          .map(f => path.join(tmpDir, f))
          .find(f => f.includes(`track_${i}.`) && !f.endsWith(`.${format}`) && !f.endsWith('.part'));

        if (!inputFile) { console.warn(`[playlist] Skipping ${id} — no download`); continue; }

        await ffmpegConvert(inputFile, outFile, format, quality);
        cleanup(inputFile);
        convertedFiles.push({ file: outFile, name: `${String(i + 1).padStart(2, '0')} - ${safeTitle}.${format}` });

      } catch (err: any) {
        console.warn(`[playlist] Skipping ${id}:`, err?.message);
      }
    }

    if (!convertedFiles.length) throw new Error('No tracks could be converted');

    // ── Step 3: pack all converted files into a ZIP and stream it ────────────────
    const zip  = new ZipArchive({ zlib: { level: 1 } }); // level 1: fast (audio is already compressed)
    const pass = new PassThrough();
    zip.pipe(pass);                // pipe archive output into PassThrough

    for (const { file, name } of convertedFiles) {
      zip.file(file, { name });
    }
    zip.finalize();               // tells archiver "no more files, close the stream"

    pass.on('end', () => {
      setTimeout(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }, 15_000);
    });

    return new Response(nodeToWebStream(pass), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="playlist_${format}.zip"`,
        'X-Track-Count': String(convertedFiles.length),
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-store',
      },
    });

  } catch (e: any) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    console.error('[playlist error]', e?.message ?? e);
    return jsonRes({ error: e?.message ?? 'Playlist conversion failed' }, 500);
  }
};
