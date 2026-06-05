import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { adminSettings } from '../../../lib/schema';
import { eq } from 'drizzle-orm';

export const prerender = false;

const SINGLETON_ID = 'singleton';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.id, SINGLETON_ID)).limit(1);
  const data = row ?? {
    freeDownloadLimit: 25, limitWindow: 'monthly',
    razorpayPlanId: '', premiumPriceDisplay: '₹199/month', maintenanceMode: false,
  };
  return new Response(JSON.stringify(data), { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  await db
    .insert(adminSettings)
    .values({
      id:                  SINGLETON_ID,
      freeDownloadLimit:   Number(body.freeDownloadLimit ?? 25),
      limitWindow:         String(body.limitWindow ?? 'monthly'),
      razorpayPlanId:      String(body.razorpayPlanId ?? ''),
      premiumPriceDisplay: String(body.premiumPriceDisplay ?? '₹199/month'),
      maintenanceMode:     Boolean(body.maintenanceMode),
      updatedAt:           new Date(),
    })
    .onConflictDoUpdate({
      target: adminSettings.id,
      set: {
        freeDownloadLimit:   Number(body.freeDownloadLimit ?? 25),
        limitWindow:         String(body.limitWindow ?? 'monthly'),
        razorpayPlanId:      String(body.razorpayPlanId ?? ''),
        premiumPriceDisplay: String(body.premiumPriceDisplay ?? '₹199/month'),
        maintenanceMode:     Boolean(body.maintenanceMode),
        updatedAt:           new Date(),
      },
    });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
