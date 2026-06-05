import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { user as userTable } from '../../../lib/schema';
import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const sig     = request.headers.get('x-razorpay-signature') ?? '';
  const secret  = import.meta.env.RAZORPAY_WEBHOOK_SECRET ?? '';

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected !== sig) return new Response('Invalid signature', { status: 400 });

  let event: { event: string; payload: any };
  try { event = JSON.parse(rawBody); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  const subscription = event.payload?.subscription?.entity;
  const uid = subscription?.notes?.uid as string | undefined;
  if (!uid) return new Response('OK', { status: 200 });

  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged':
      await db.update(userTable)
        .set({ plan: 'premium', subscriptionStatus: 'active', razorpaySubscriptionId: subscription.id })
        .where(eq(userTable.id, uid));
      break;

    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.expired':
      await db.update(userTable)
        .set({ plan: 'free', subscriptionStatus: event.event.split('.')[1] })
        .where(eq(userTable.id, uid));
      break;
  }

  return new Response('OK', { status: 200 });
};
