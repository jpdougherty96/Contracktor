import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  fetchBusinessEntitlements,
  isFeatureEnabled,
  type BusinessEntitlements,
  type KnownSubscriptionFeatureKey,
} from '@/src/lib/entitlements';
import { supabase } from '@/src/lib/supabase';

const freeBaselineFeatures = new Set<KnownSubscriptionFeatureKey>([
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
  'tell.basic',
]);

type EntitlementsContextValue = {
  entitlements: BusinessEntitlements | null;
  error: string | null;
  hasFeature: (featureKey: KnownSubscriptionFeatureKey | string) => boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<BusinessEntitlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);

  const loadEntitlements = useCallback(async (nextSession: Session | null) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!nextSession) {
      setEntitlements(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const nextEntitlements = await fetchBusinessEntitlements();

      if (requestIdRef.current === requestId) {
        setEntitlements(nextEntitlements);
        setError(null);
      }
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setEntitlements(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load subscription features.'
        );
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadEntitlements(session);
  }, [loadEntitlements, session]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      void loadEntitlements(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setTimeout(() => {
        if (isMounted) {
          void loadEntitlements(nextSession);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [loadEntitlements]);

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      entitlements,
      error,
      hasFeature: (featureKey) =>
        entitlements
          ? isFeatureEnabled(entitlements, featureKey)
          : freeBaselineFeatures.has(featureKey as KnownSubscriptionFeatureKey),
      isLoading,
      refresh,
    }),
    [entitlements, error, isLoading, refresh]
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextValue {
  const context = useContext(EntitlementsContext);

  if (!context) {
    throw new Error('useEntitlements must be used inside EntitlementsProvider.');
  }

  return context;
}

export function isFreeBaselineFeature(featureKey: KnownSubscriptionFeatureKey): boolean {
  return freeBaselineFeatures.has(featureKey);
}
