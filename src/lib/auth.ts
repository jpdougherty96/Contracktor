import type { Session, User } from '@supabase/supabase-js';

export type AuthState = {
  session: Session | null;
  user: User | null;
};

export async function getCurrentAuthState(): Promise<AuthState> {
  const { supabase } = await import('@/src/lib/supabase');
  const { data, error } = await supabase.auth.getSession();

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
