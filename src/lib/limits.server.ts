import { db } from './db';
import { user as userTable, adminSettings } from './schema';
import { eq } from 'drizzle-orm';

export class LimitExceeded extends Error {
  constructor(public used: number, public limit: number) {
    super('limit_exceeded');
  }
}

async function getSettings() {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.id, 'singleton')).limit(1);
  return {
    freeDownloadLimit: row?.freeDownloadLimit ?? 25,
    limitWindow:       (row?.limitWindow ?? 'monthly') as 'daily' | 'monthly' | 'lifetime',
  };
}

function nextResetDate(window: 'daily' | 'monthly'): Date {
  const now = new Date();
  if (window === 'daily') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export async function checkAndIncrementDownload(uid: string, trackCount = 1): Promise<void> {
  const settings = await getSettings();

  const [u] = await db
    .select({ plan: userTable.plan, downloadCount: userTable.downloadCount, downloadCountResetAt: userTable.downloadCountResetAt })
    .from(userTable)
    .where(eq(userTable.id, uid))
    .limit(1);

  if (!u) throw new Error('User not found');
  if (u.plan === 'premium') return;

  const now  = new Date();
  let count  = u.downloadCount ?? 0;
  let resetAt = u.downloadCountResetAt;

  // Reset if window elapsed
  if (settings.limitWindow !== 'lifetime' && resetAt && resetAt <= now) {
    count   = 0;
    resetAt = null;
  }

  if (count + trackCount > settings.freeDownloadLimit) {
    throw new LimitExceeded(count, settings.freeDownloadLimit);
  }

  const updates: Partial<typeof userTable.$inferInsert> = {
    downloadCount: count + trackCount,
  };

  if (settings.limitWindow !== 'lifetime' && !resetAt) {
    updates.downloadCountResetAt = nextResetDate(settings.limitWindow);
  }

  await db.update(userTable).set(updates).where(eq(userTable.id, uid));
}

export async function getUserUsage(uid: string) {
  const [settings, userRow] = await Promise.all([
    getSettings(),
    db.select({ plan: userTable.plan, downloadCount: userTable.downloadCount, downloadCountResetAt: userTable.downloadCountResetAt })
      .from(userTable).where(eq(userTable.id, uid)).limit(1),
  ]);

  const u = userRow[0];
  if (!u) return { count: 0, limit: settings.freeDownloadLimit, window: settings.limitWindow, plan: 'free' };

  const now   = new Date();
  let count   = u.downloadCount ?? 0;
  const resetAt = u.downloadCountResetAt;

  if (settings.limitWindow !== 'lifetime' && resetAt && resetAt <= now) count = 0;

  return {
    count,
    limit:  settings.freeDownloadLimit,
    window: settings.limitWindow,
    plan:   u.plan ?? 'free',
  };
}
