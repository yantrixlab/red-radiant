import type { APIRoute } from 'astro';
import { getUserUsage } from '../../lib/limits.server';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ user: null }), { status: 200 });
  const usage = await getUserUsage(locals.user.uid);
  return new Response(JSON.stringify({
    user: { uid: locals.user.uid, email: locals.user.email, isAdmin: locals.user.isAdmin, ...usage },
  }), { status: 200 });
};
