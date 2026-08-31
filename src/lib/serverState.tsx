import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  queryOptions,
} from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { fetchGlobalActivity } from '@/src/lib/globalActivity';
import { fetchJob, fetchJobs, fetchStartWorkJobs } from '@/src/lib/jobs';
import { supabase } from '@/src/lib/supabase';
import { fetchActiveTimerState } from '@/src/lib/timeClock';

export const serverStateKeys = {
  activeTimer: ['time-clock', 'active'] as const,
  activity: ['activity', 'global'] as const,
  job: (jobId: string) => ['jobs', 'detail', jobId] as const,
  jobs: ['jobs', 'list'] as const,
  startWorkJobs: ['jobs', 'start-work'] as const,
};

export const activeTimerQueryOptions = () =>
  queryOptions({
    queryFn: fetchActiveTimerState,
    queryKey: serverStateKeys.activeTimer,
    staleTime: 15_000,
  });

export const startWorkJobsQueryOptions = () =>
  queryOptions({
    queryFn: fetchStartWorkJobs,
    queryKey: serverStateKeys.startWorkJobs,
    staleTime: 30_000,
  });

export const jobsQueryOptions = () =>
  queryOptions({
    queryFn: fetchJobs,
    queryKey: serverStateKeys.jobs,
    staleTime: 30_000,
  });

export const jobQueryOptions = (jobId: string) =>
  queryOptions({
    queryFn: () => fetchJob(jobId),
    queryKey: serverStateKeys.job(jobId),
    staleTime: 30_000,
  });

export const globalActivityQueryOptions = () =>
  queryOptions({
    queryFn: fetchGlobalActivity,
    queryKey: serverStateKeys.activity,
    refetchInterval: (query) =>
      query.state.data?.hasPendingTellProcessing ? 3000 : false,
    staleTime: 15_000,
  });

export const serverStateClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      gcTime: 10 * 60_000,
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function ServerStateProvider({ children }: { children: ReactNode }) {
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;

      if (activeUserIdRef.current && activeUserIdRef.current !== nextUserId) {
        serverStateClient.clear();
      }

      activeUserIdRef.current = nextUserId;
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return <QueryClientProvider client={serverStateClient}>{children}</QueryClientProvider>;
}
