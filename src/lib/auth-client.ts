import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? window.location.origin
    : (import.meta.env.BETTER_AUTH_URL ?? ''),
});

export const { signIn, signUp, signOut, useSession } = authClient;
