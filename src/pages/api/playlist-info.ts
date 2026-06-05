import type { APIRoute } from 'astro';
import { getYtDlp, jsonRes } from '../../lib/ytdlp.server';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string };
  try { body = await request.json(); }
  catch { return jsonRes({ error: 'Invalid request' }, 400); }

  const { url = '' } = body;
  if (!url) return jsonRes({ error: 'URL required' }, 400);

  try {
    const ytDlp = await getYtDlp();

    // Get flat playlist info: title, count, video id, and track title
    const raw: string = await ytDlp.execPromise([
      url,
      '--flat-playlist',
      '--print', '%(playlist_title)s|||%(playlist_count)s|||%(id)s|||%(title)s',
      '--playlist-end', '100',
      '--no-warnings',
      '--quiet',
    ]);

    const lines = raw.trim().split('\n').filter(Boolean);
    if (!lines.length) throw new Error('No playlist data returned');

    const [playlistTitle, countStr] = lines[0].split('|||');
    const tracks = lines.map(l => {
      const parts = l.split('|||');
      return { id: parts[2]?.trim() ?? '', title: parts[3]?.trim() ?? parts[2]?.trim() ?? '' };
    }).filter(t => t.id);
    const count = parseInt(countStr) || tracks.length;

    return jsonRes({ title: playlistTitle || 'Playlist', count, tracks });

  } catch (e: any) {
    console.error('[playlist-info error]', e?.message);
    return jsonRes({ error: 'Could not fetch playlist info. Check the URL.' }, 500);
  }
};
