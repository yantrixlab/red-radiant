import type { APIRoute } from 'astro';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export const prerender = false;

// One-time migration runner — callable only by admins
// POST /api/admin/migrate
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const client = postgres(
      import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '',
      { max: 1 },
    );
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './drizzle' });
    await client.end();
    return new Response(JSON.stringify({ ok: true, message: 'Migrations applied successfully' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
