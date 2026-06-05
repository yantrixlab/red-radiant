import { defineMiddleware } from 'astro:middleware';
import { auth } from './lib/auth';
import { db, ensureTables } from './lib/db';
import { user as userTable } from './lib/schema';
import { eq } from 'drizzle-orm';

export const onRequest = defineMiddleware(async (context, next) => {
  // Ensure DB tables exist (no-op after first successful run)
  await ensureTables();

  try {
    const session = await auth.api.getSession({ headers: context.request.headers });

    if (session?.user) {
      // Fetch latest plan/isAdmin from DB (session may be cached)
      const [dbUser] = await db
        .select({
          plan:    userTable.plan,
          isAdmin: userTable.isAdmin,
        })
        .from(userTable)
        .where(eq(userTable.id, session.user.id))
        .limit(1);

      context.locals.user = {
        uid:     session.user.id,
        email:   session.user.email,
        plan:    (dbUser?.plan ?? 'free') as 'free' | 'premium',
        isAdmin: dbUser?.isAdmin ?? false,
      };
    } else {
      context.locals.user = null;
    }
  } catch {
    context.locals.user = null;
  }

  return next();
});
