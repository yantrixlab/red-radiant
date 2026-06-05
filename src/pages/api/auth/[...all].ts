import { auth } from '../../../lib/auth';
import type { APIRoute } from 'astro';

export const prerender = false;

// Better Auth handles all routes under /api/auth/*
const handler: APIRoute = ({ request }) => auth.handler(request);

export const GET  = handler;
export const POST = handler;
