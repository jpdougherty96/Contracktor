type SupabaseConnectionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export async function testSupabaseConnection(): Promise<SupabaseConnectionResult> {
  try {
    const { supabase } = await import('@/src/lib/supabase');
    const { error } = await supabase.from('jobs').select('*').limit(1);

    if (error) {
      return {
        ok: false,
        error: error.message,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Supabase connection error.',
    };
  }
}
