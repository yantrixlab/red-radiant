import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { adminSettings, user as userTable } from '../../../lib/schema';
import { eq } from 'drizzle-orm';
import { createRequire } from 'module';

export const prerender = false;
const _require = createRequire(import.meta.url);

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'login_required' }), { status: 401 });

  const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.id, 'singleton')).limit(1);
  const planId = settings?.razorpayPlanId;
  if (!planId) return new Response(JSON.stringify({ error: 'Subscription not configured' }), { status: 500 });

  try {
    const Razorpay = _require('razorpay');
    const rzp = new Razorpay({
      key_id:     import.meta.env.RAZORPAY_KEY_ID,
      key_secret: import.meta.env.RAZORPAY_KEY_SECRET,
    });

    const subscription = await rzp.subscriptions.create({
      plan_id:         planId,
      total_count:     12,
      customer_notify: 1,
      notes:           { uid: locals.user.uid, email: locals.user.email },
    });

    await db.update(userTable)
      .set({ razorpaySubscriptionId: subscription.id, subscriptionStatus: 'pending' })
      .where(eq(userTable.id, locals.user.uid));

    return new Response(JSON.stringify({ subscription_id: subscription.id }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
