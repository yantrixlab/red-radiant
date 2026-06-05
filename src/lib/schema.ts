import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

// ── Better Auth required tables ───────────────────────────────────────────────
export const user = pgTable('user', {
  id:                      text('id').primaryKey(),
  name:                    text('name').notNull(),
  email:                   text('email').notNull().unique(),
  emailVerified:           boolean('email_verified').notNull().default(false),
  image:                   text('image'),
  createdAt:               timestamp('created_at').notNull(),
  updatedAt:               timestamp('updated_at').notNull(),
  // Custom fields
  plan:                    text('plan').notNull().default('free'),
  isAdmin:                 boolean('is_admin').notNull().default(false),
  downloadCount:           integer('download_count').notNull().default(0),
  downloadCountResetAt:    timestamp('download_count_reset_at'),
  razorpaySubscriptionId:  text('razorpay_subscription_id'),
  subscriptionStatus:      text('subscription_status'),
});

export const session = pgTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token:     text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id:                      text('id').primaryKey(),
  accountId:               text('account_id').notNull(),
  providerId:              text('provider_id').notNull(),
  userId:                  text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken:             text('access_token'),
  refreshToken:            text('refresh_token'),
  idToken:                 text('id_token'),
  accessTokenExpiresAt:    timestamp('access_token_expires_at'),
  refreshTokenExpiresAt:   timestamp('refresh_token_expires_at'),
  scope:                   text('scope'),
  password:                text('password'),
  createdAt:               timestamp('created_at').notNull(),
  updatedAt:               timestamp('updated_at').notNull(),
});

export const verification = pgTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at'),
  updatedAt:  timestamp('updated_at'),
});

// ── App-specific tables ───────────────────────────────────────────────────────
export const adminSettings = pgTable('admin_settings', {
  id:                   text('id').primaryKey().default('singleton'),
  freeDownloadLimit:    integer('free_download_limit').notNull().default(25),
  limitWindow:          text('limit_window').notNull().default('monthly'),
  razorpayPlanId:       text('razorpay_plan_id').notNull().default(''),
  premiumPriceDisplay:  text('premium_price_display').notNull().default('₹199/month'),
  maintenanceMode:      boolean('maintenance_mode').notNull().default(false),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});
