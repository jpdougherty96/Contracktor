import type { User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';

export type AccountProfile = {
  companyName: string | null;
  defaultHourlyRate: number | null;
  email: string | null;
  fullName: string | null;
};

export type UpdateAccountProfileInput = {
  companyName?: string | null;
  defaultHourlyRate?: number | null;
  fullName?: string | null;
};

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

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to edit account settings.');
  }

  await ensureProfileForUser(userData.user);

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, company_name, default_hourly_rate')
    .eq('id', userData.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    companyName: data.company_name,
    defaultHourlyRate: data.default_hourly_rate,
    email: userData.user.email ?? null,
    fullName: data.full_name,
  };
}

export async function updateAccountProfile(input: UpdateAccountProfileInput): Promise<AccountProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update account settings.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      company_name: cleanOptionalText(input.companyName),
      default_hourly_rate: input.defaultHourlyRate ?? null,
      full_name: cleanOptionalText(input.fullName),
    })
    .eq('id', userData.user.id)
    .select('full_name, company_name, default_hourly_rate')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    companyName: data.company_name,
    defaultHourlyRate: data.default_hourly_rate,
    email: userData.user.email ?? null,
    fullName: data.full_name,
  };
}

export async function fetchCurrentProfileDisplayName(): Promise<string | null> {
  const profile = await fetchCurrentProfile();

  return profile.displayName;
}

export async function fetchCurrentProfile(): Promise<{
  defaultHourlyRate: number | null;
  displayName: string | null;
}> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return {
      defaultHourlyRate: null,
      displayName: null,
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, default_hourly_rate')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.full_name) {
    return {
      defaultHourlyRate: data.default_hourly_rate,
      displayName: data.full_name,
    };
  }

  const metadataName = userData.user.user_metadata.full_name;

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return {
      defaultHourlyRate: data?.default_hourly_rate ?? null,
      displayName: metadataName.trim(),
    };
  }

  return {
    defaultHourlyRate: data?.default_hourly_rate ?? null,
    displayName: userData.user.email?.split('@')[0] ?? null,
  };
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}
