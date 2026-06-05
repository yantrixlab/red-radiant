import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = form.get('email')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  const adminEmail = import.meta.env.ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
  const adminPassword = import.meta.env.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';

  if (!adminPassword || email !== adminEmail || password !== adminPassword) {
    return redirect('/admin/login?error=1');
  }

  const response = redirect('/admin');
  response.headers.append(
    'Set-Cookie',
    `admin_session=authenticated; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
  );
  return response;
};

export const GET: APIRoute = async ({ redirect }) => redirect('/admin/login');
