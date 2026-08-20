import { supabase } from '@/src/lib/supabase';
import type { Json } from '@/src/types/database';

export const subscriptionFeatureKeys = [
  'core.jobs',
  'core.job_financials',
  'core.hours',
  'core.time_clock',
  'core.receipts',
  'core.receipt_extraction',
  'core.expenses',
  'core.shopping',
  'core.payments',
  'core.notes_photos',
  'core.invoices_reports',
  'activity.feed',
  'receipt.smart_allocation',
  'tell.basic',
  'tell.conversation',
  'tell.voice',
  'tell.job_memory',
  'tell.job_questions',
  'tell.global',
  'tell.job_creation',
  'automation.proactive',
] as const;

export type KnownSubscriptionFeatureKey = (typeof subscriptionFeatureKeys)[number];

export type FeatureEntitlement = {
  config: Record<string, Json | undefined>;
  enabled: boolean;
  limit: number | null;
  source: 'override' | 'plan';
};

export type BusinessEntitlements = {
  businessId: string;
  features: Record<string, FeatureEntitlement>;
  plan: {
    cancelAtPeriodEnd: boolean;
    currentPeriodEndsAt: string | null;
    key: string;
    name: string;
    status: string;
    trialEndsAt: string | null;
  };
};

export async function fetchBusinessEntitlements(
  businessId?: string | null
): Promise<BusinessEntitlements> {
  const { data, error } = await supabase.rpc('get_my_entitlements', {
    p_business_id: businessId ?? undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseBusinessEntitlements(data);
}

export function isFeatureEnabled(
  entitlements: BusinessEntitlements,
  featureKey: KnownSubscriptionFeatureKey | string
): boolean {
  return entitlements.features[featureKey]?.enabled === true;
}

export function getFeatureLimit(
  entitlements: BusinessEntitlements,
  featureKey: KnownSubscriptionFeatureKey | string
): number | null {
  return entitlements.features[featureKey]?.limit ?? null;
}

export function getFeatureConfig(
  entitlements: BusinessEntitlements,
  featureKey: KnownSubscriptionFeatureKey | string
): Record<string, Json | undefined> {
  return entitlements.features[featureKey]?.config ?? {};
}

function parseBusinessEntitlements(value: Json): BusinessEntitlements {
  if (!isJsonObject(value)) {
    throw new Error('conTRACKtor returned invalid subscription entitlements.');
  }

  const businessId = readRequiredString(value.business_id, 'business');
  const rawPlan = value.plan;
  const rawFeatures = value.features;

  if (!isJsonObject(rawPlan) || !isJsonObject(rawFeatures)) {
    throw new Error('conTRACKtor returned incomplete subscription entitlements.');
  }

  const features: Record<string, FeatureEntitlement> = {};

  for (const [featureKey, rawFeature] of Object.entries(rawFeatures)) {
    if (!isJsonObject(rawFeature)) {
      continue;
    }

    const rawConfig = rawFeature.config;
    const rawLimit = rawFeature.limit;
    const rawSource = rawFeature.source;

    features[featureKey] = {
      config: isJsonObject(rawConfig) ? rawConfig : {},
      enabled: rawFeature.enabled === true,
      limit: typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : null,
      source: rawSource === 'override' ? 'override' : 'plan',
    };
  }

  return {
    businessId,
    features,
    plan: {
      cancelAtPeriodEnd: rawPlan.cancel_at_period_end === true,
      currentPeriodEndsAt: readOptionalString(rawPlan.current_period_ends_at),
      key: readRequiredString(rawPlan.key, 'plan key'),
      name: readRequiredString(rawPlan.name, 'plan name'),
      status: readRequiredString(rawPlan.status, 'plan status'),
      trialEndsAt: readOptionalString(rawPlan.trial_ends_at),
    },
  };
}

function isJsonObject(value: Json | undefined): value is Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: Json | undefined, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`conTRACKtor returned an invalid ${label}.`);
  }

  return value;
}

function readOptionalString(value: Json | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
