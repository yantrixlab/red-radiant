/**
 * One-time database setup endpoint.
 * Protected by SETUP_SECRET env var.
 * Usage: POST /api/setup  with header  x-setup-secret: <your secret>
 * Run this once after deploy to create all tables.
 */
import type { APIRoute } from 'astro';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

export const prerender = false;

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "plan" text DEFAULT 'free' NOT NULL,
  "is_admin" boolean DEFAULT false NOT NULL,
  "download_count" integer DEFAULT 0 NOT NULL,
  "download_count_reset_at" timestamp,
  "razorpay_subscription_id" text,
  "subscription_status" text,
  CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE IF NOT EXISTS "admin_settings" (
  "id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
  "free_download_limit" integer DEFAULT 25 NOT NULL,
  "limit_window" text DEFAULT 'monthly' NOT NULL,
  "razorpay_plan_id" text DEFAULT '' NOT NULL,
  "premium_price_display" text DEFAULT '₹199/month' NOT NULL,
  "maintenance_mode" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "session"
  ADD CONSTRAINT IF NOT EXISTS "session_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade;

ALTER TABLE "account"
  ADD CONSTRAINT IF NOT EXISTS "account_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade;
`;

export const POST: APIRoute = async ({ request }) => {
  const secret       = request.headers.get('x-setup-secret');
  const envSecret    = import.meta.env.SETUP_SECRET ?? process.env.SETUP_SECRET;

  if (!envSecret || secret !== envSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const client = postgres(
      import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '',
      { max: 1, ssl: 'prefer' },
    );
    const db = drizzle(client);
    await db.execute(sql.raw(MIGRATION_SQL));
    await client.end();
    return new Response(JSON.stringify({ ok: true, message: 'All tables created successfully' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

// GET — just checks if DB is reachable
export const GET: APIRoute = async ({ request }) => {
  const secret    = request.headers.get('x-setup-secret');
  const envSecret = import.meta.env.SETUP_SECRET ?? process.env.SETUP_SECRET;
  if (!envSecret || secret !== envSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const client = postgres(
      import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '',
      { max: 1, ssl: 'prefer' },
    );
    const db = drizzle(client);
    await db.execute(sql`SELECT 1`);
    await client.end();
    return new Response(JSON.stringify({ ok: true, message: 'Database reachable' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
