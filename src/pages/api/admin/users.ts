import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { user as userTable } from '../../../lib/schema';
import { eq, desc } from 'drizzle-orm';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const rows  = await db
    .select({
      id:            userTable.id,
      email:         userTable.email,
      name:          userTable.name,
      plan:          userTable.plan,
      downloadCount: userTable.downloadCount,
      isAdmin:       userTable.isAdmin,
      createdAt:     userTable.createdAt,
    })
    .from(userTable)
    .orderBy(desc(userTable.createdAt))
    .limit(limit);

  return new Response(JSON.stringify({ users: rows }), { status: 200 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  let body: { uid?: string; plan?: 'free' | 'premium' };
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  if (!body.uid || !body.plan) return new Response(JSON.stringify({ error: 'uid and plan required' }), { status: 400 });

  await db.update(userTable).set({ plan: body.plan }).where(eq(userTable.id, body.uid));
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
