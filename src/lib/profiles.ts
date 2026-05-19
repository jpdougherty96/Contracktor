import type { User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';

export async function ensureProfileForUser(user: User): Promise<void> {
  const { data, error } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();

  if (error) {
    throw new Error(`Unable to verify profile row: ${error.message}`);
  }

  if (data) {
    return;
  }

  const metadata = user.user_metadata;
  const { error: insertError } = await supabase.from('profiles').insert({
    id: user.id,
    full_name: typeof metadata.full_name === 'string' ? metadata.full_name : null,
    company_name: typeof metadata.company_name === 'string' ? metadata.company_name : null,
  });

  if (insertError) {
    throw new Error(`Unable to create profile row: ${insertError.message}`);
  }
}

export async function fetchCurrentProfileDisplayName(): Promise<string | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.full_name) {
    return data.full_name;
  }

  const metadataName = userData.user.user_metadata.full_name;

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  return userData.user.email?.split('@')[0] ?? null;
}
