import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from './schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user:         schema.user,
      session:      schema.session,
      account:      schema.account,
      verification: schema.verification,
    },
  }),

  secret: import.meta.env.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
  baseURL: import.meta.env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:4321',
  trustedOrigins: [
    'http://localhost:4321',
    'http://localhost:3000',
    'https://youtube2mp3file.com',
    ...(import.meta.env.BETTER_AUTH_URL ? [import.meta.env.BETTER_AUTH_URL] : []),
  ],

  emailAndPassword: { enabled: true },

  socialProviders: {
    google: {
      clientId:     import.meta.env.GOOGLE_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  user: {
    additionalFields: {
      plan:                   { type: 'string',  defaultValue: 'free',  fieldName: 'plan' },
      isAdmin:                { type: 'boolean', defaultValue: false,   fieldName: 'is_admin' },
      downloadCount:          { type: 'number',  defaultValue: 0,       fieldName: 'download_count' },
      downloadCountResetAt:   { type: 'date',    required: false,       fieldName: 'download_count_reset_at' },
      razorpaySubscriptionId: { type: 'string',  required: false,       fieldName: 'razorpay_subscription_id' },
      subscriptionStatus:     { type: 'string',  required: false,       fieldName: 'subscription_status' },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const adminEmail = import.meta.env.ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
          return {
            data: {
              ...userData,
              isAdmin: adminEmail ? userData.email === adminEmail : false,
            },
          };
        },
      },
    },
  },
});
