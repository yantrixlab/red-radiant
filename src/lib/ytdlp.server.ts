import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';

const _require = createRequire(import.meta.url);

export const ffmpegPath: string = _require('ffmpeg-static');
export const Ffmpeg: typeof import('fluent-ffmpeg') = _require('fluent-ffmpeg');
Ffmpeg.setFfmpegPath(ffmpegPath);

// ─── yt-dlp bootstrap ─────────────────────────────────────────────────────────
const BIN_DIR   = path.join(os.tmpdir(), '.ytdlp');
const STAMP     = path.join(BIN_DIR, '.standalone'); // marker = correct binary installed
const BIN_NAME  = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const BIN_PATH  = path.join(BIN_DIR, BIN_NAME);
const DL_NAME   = process.platform === 'win32' ? 'yt-dlp.exe'
                : process.platform === 'darwin' ? 'yt-dlp_macos'
                : 'yt-dlp_linux'; // standalone PyInstaller — no Python needed

let _instance: any = null;
let _init: Promise<void> | null = null;

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => https.get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return get(res.headers.location);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      res.on('error', reject);
    }).on('error', reject);
    get(url);
  });
}

async function bootstrap() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // If stamp file is missing the old Python zipapp is cached — delete and re-download
  if (fs.existsSync(BIN_PATH) && !fs.existsSync(STAMP)) {
    fs.unlinkSync(BIN_PATH);
    console.log('[yt-dlp] Removed old Python zipapp, downloading standalone binary…');
  }

  if (!fs.existsSync(BIN_PATH)) {
    console.log('[yt-dlp] Downloading standalone binary:', DL_NAME);
    await downloadFile(
      `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${DL_NAME}`,
      BIN_PATH,
    );
    if (process.platform !== 'win32') fs.chmodSync(BIN_PATH, 0o755);
    fs.writeFileSync(STAMP, 'standalone'); // mark as correct binary
    console.log('[yt-dlp] Ready:', BIN_PATH);
  }
  const YTDlpWrap = _require('yt-dlp-wrap').default;
  _instance = new YTDlpWrap(BIN_PATH);
}

export async function getYtDlp() {
  if (_instance) return _instance as any;
  if (!_init) _init = bootstrap();
  await _init;
  return _instance as any;
}

export function ffmpegConvert(input: string, output: string, format: string, quality: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = Ffmpeg(input);
    if (format === 'wav') {
      cmd = cmd.format('wav');
    } else if (format === 'm4a') {
      cmd = cmd.audioCodec('aac').format('ipod');
    } else {
      const br = ['128','192','256','320'].includes(quality) ? parseInt(quality) : 320;
      cmd = cmd.audioCodec('libmp3lame').audioBitrate(br).format('mp3');
    }
    cmd.on('error', reject).on('end', resolve).save(output);
  });
}

export function nodeToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data',  (c: Buffer) => controller.enqueue(new Uint8Array(c)));
      nodeStream.on('end',   ()          => controller.close());
      nodeStream.on('error', (e)         => controller.error(e));
    },
    cancel() { (nodeStream as any).destroy?.(); },
  });
}

export function cleanup(...files: string[]) {
  for (const f of files) try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch[?&]v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function jsonRes(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
