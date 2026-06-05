import type { APIRoute } from 'astro';
import postgres from 'postgres';

export const prerender = false;

// GET /api/debug?secret=setup-yt2mp3-2024
export const GET: APIRoute = async ({ url }) => {
  const secret = url.searchParams.get('secret');
  const envSecret = import.meta.env.SETUP_SECRET ?? process.env.SETUP_SECRET;
  if (!envSecret || secret !== envSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const dbUrl = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  const results: Record<string, any> = {
    hasDbUrl: !!dbUrl,
    dbUrlPrefix: dbUrl.substring(0, 30) + '…',
    hasBetterAuthSecret: !!(import.meta.env.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET),
    betterAuthUrl: import.meta.env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
  };

  // Test DB connection
  try {
    const client = postgres(dbUrl, { max: 1, ssl: 'prefer', connect_timeout: 10 });
    await client`SELECT 1 as ok`;
    results.dbConnection = 'OK';

    // Check which tables exist
    const tables = await client`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    results.existingTables = tables.map((r: any) => r.table_name);
    await client.end();
  } catch (e: any) {
    results.dbConnection = 'FAILED';
    results.dbError = e.message;
  }

  // Test Better Auth init
  try {
    const { auth } = await import('../../lib/auth');
    results.betterAuthInit = 'OK';
  } catch (e: any) {
    results.betterAuthInit = 'FAILED';
    results.betterAuthError = e.message;
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
