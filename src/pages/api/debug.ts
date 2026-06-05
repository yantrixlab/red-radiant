import type { APIRoute } from 'astro';
import postgres from 'postgres';

// POST /api/debug/make-admin?secret=...&email=...
export const POST: APIRoute = async ({ url }) => {
  const secret = url.searchParams.get('secret');
  const email = url.searchParams.get('email');
  const envSecret = import.meta.env.SETUP_SECRET ?? process.env.SETUP_SECRET;
  if (!envSecret || secret !== envSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  if (!email) {
    return new Response(JSON.stringify({ error: 'email param required' }), { status: 400 });
  }
  const dbUrl = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  try {
    const client = postgres(dbUrl, { max: 1, ssl: 'prefer' });
    const result = await client`UPDATE "user" SET "is_admin" = true WHERE "email" = ${email} RETURNING id, email`;
    await client.end();
    if (result.length === 0) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    return new Response(JSON.stringify({ ok: true, updated: result[0] }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

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

  // Test Better Auth createUser directly
  try {
    const { auth } = await import('../../lib/auth');
    const ctx = await (auth as any).api.signUpEmail({
      body: { name: 'Debug', email: `debug-${Date.now()}@test.com`, password: 'TestPass123!' },
    });
    results.betterAuthSignup = 'OK';
  } catch (e: any) {
    results.betterAuthSignup = 'FAILED';
    results.betterAuthSignupError = e?.message ?? String(e);
    results.betterAuthSignupStack = e?.stack?.split('\n').slice(0, 5).join(' | ');
    results.betterAuthSignupCause = e?.cause ? String(e.cause) : undefined;
  }

  // Test direct user insert via Drizzle
  try {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const postgres2 = (await import('postgres')).default;
    const schema2 = await import('../../lib/schema');
    const client2 = postgres2(dbUrl, { max: 1, ssl: 'prefer', connect_timeout: 10 });
    const db2 = drizzle(client2, { schema: schema2 });
    const testId = 'debug-test-' + Date.now();
    await db2.insert(schema2.user).values({
      id: testId,
      name: 'Debug Test',
      email: `debugtest-${Date.now()}@test.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { eq } = await import('drizzle-orm');
    await db2.delete(schema2.user).where(eq(schema2.user.id, testId));
    await client2.end();
    results.directInsert = 'OK';
  } catch (e: any) {
    results.directInsert = 'FAILED';
    results.directInsertError = e.message;
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
