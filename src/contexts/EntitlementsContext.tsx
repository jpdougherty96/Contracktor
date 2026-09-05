import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
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
import { getCurrentAuthState } from '@/src/lib/auth';
import {
  clearSessionCookie,
  markKnownUser,
  markSessionActive,
} from '@/src/lib/audienceCookies';
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
  authError: string | null;
  authEvent: AuthChangeEvent | null;
  entitlements: BusinessEntitlements | null;
  error: string | null;
  hasFeature: (featureKey: KnownSubscriptionFeatureKey | string) => boolean;
  isAuthLoading: boolean;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
  refresh: () => Promise<void>;
  session: Session | null;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<BusinessEntitlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);
  const authRequestIdRef = useRef(0);

  const refreshAuth = useCallback(async () => {
    const requestId = authRequestIdRef.current + 1;
    authRequestIdRef.current = requestId;
    setIsAuthLoading(true);

    try {
      const authState = await getCurrentAuthState();

      if (authRequestIdRef.current === requestId) {
        setSession(authState.session);
        setAuthError(null);
      }
    } catch (loadError) {
      if (authRequestIdRef.current === requestId) {
        setSession(null);
        setAuthError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to restore your session. Try again.'
        );
      }
    } finally {
      if (authRequestIdRef.current === requestId) {
        setIsAuthLoading(false);
      }
    }
  }, []);

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

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setAuthEvent(event);
      setAuthError(null);
      setIsAuthLoading(false);
    });

    void refreshAuth();

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [refreshAuth]);

  useEffect(() => {
    void loadEntitlements(session);
  }, [loadEntitlements, session]);

  useEffect(() => {
    if (session) {
      markKnownUser();
      markSessionActive();
      return;
    }

    clearSessionCookie();
  }, [session]);

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      authError,
      authEvent,
      entitlements,
      error,
      hasFeature: (featureKey) =>
        entitlements
          ? isFeatureEnabled(entitlements, featureKey)
          : freeBaselineFeatures.has(featureKey as KnownSubscriptionFeatureKey),
      isAuthLoading,
      isLoading,
      refreshAuth,
      refresh,
      session,
    }),
    [
      authError,
      authEvent,
      entitlements,
      error,
      isAuthLoading,
      isLoading,
      refresh,
      refreshAuth,
      session,
    ]
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
