import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DATABASE_URL = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const client = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: 'prefer',
});

export const db = drizzle(client, { schema });

// Auto-create tables on first use (idempotent — IF NOT EXISTS)
let migrated = false;
export async function ensureTables() {
  if (migrated) return;
  migrated = true;
  try {
    await client`
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
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS "session" (
        "id" text PRIMARY KEY NOT NULL,
        "expires_at" timestamp NOT NULL,
        "token" text NOT NULL,
        "created_at" timestamp NOT NULL,
        "updated_at" timestamp NOT NULL,
        "ip_address" text,
        "user_agent" text,
        "user_id" text NOT NULL,
        CONSTRAINT "session_token_unique" UNIQUE("token"),
        CONSTRAINT "session_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `;
    await client`
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
        "updated_at" timestamp NOT NULL,
        CONSTRAINT "account_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS "verification" (
        "id" text PRIMARY KEY NOT NULL,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp,
        "updated_at" timestamp
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS "admin_settings" (
        "id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
        "free_download_limit" integer DEFAULT 25 NOT NULL,
        "limit_window" text DEFAULT 'monthly' NOT NULL,
        "razorpay_plan_id" text DEFAULT '' NOT NULL,
        "premium_price_display" text DEFAULT '₹199/month' NOT NULL,
        "maintenance_mode" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    console.log('[db] Tables ready');
  } catch (e: any) {
    console.error('[db] ensureTables failed:', e.message);
    migrated = false; // allow retry
  }
}
