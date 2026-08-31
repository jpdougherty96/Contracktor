import type { Session, User } from '@supabase/supabase-js';

export type AuthState = {
  session: Session | null;
  user: User | null;
};

export const AUTH_SESSION_TIMEOUT_MS = 10_000;

export class AuthSessionTimeoutError extends Error {
  constructor() {
    super('Your session took too long to restore. Check your connection and try again.');
    this.name = 'AuthSessionTimeoutError';
  }
}

export async function getCurrentAuthState(): Promise<AuthState> {
  const { supabase } = await import('@/src/lib/supabase');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new AuthSessionTimeoutError()), AUTH_SESSION_TIMEOUT_MS);
  });

  let result: Awaited<ReturnType<typeof supabase.auth.getSession>>;

  try {
    result = await Promise.race([supabase.auth.getSession(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  const { data, error } = result;

  if (error) {
    throw error;
  }

  return {
    session: data.session,
    user: data.session?.user ?? null,
  };
}

export async function signOut(): Promise<void> {
  const { supabase } = await import('@/src/lib/supabase');
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
