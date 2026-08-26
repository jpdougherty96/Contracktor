import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthenticatedRoute } from '@/src/components/AuthenticatedRoute';
import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { ScreenLayout } from '@/src/components/ScreenLayout';
import { useEntitlements } from '@/src/contexts/EntitlementsContext';
import { jobQueryOptions, serverStateKeys } from '@/src/lib/serverState';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { JobDashboardScreen } from '@/src/screens/JobDashboardScreen';
import { colors } from '@/src/styles/theme';

type JobLegacyScreen =
  | 'addUpdate'
  | 'editHours'
  | 'editJob'
  | 'editNote'
  | 'editPayment'
  | 'invoiceDraft'
  | 'jobReport'
  | 'reviewReceipt'
  | 'shoppingList';

export default function JobDetailRoute() {
  const { from, jobId } = useLocalSearchParams<{ from?: string; jobId?: string }>();
  const queryClient = useQueryClient();
  const { hasFeature } = useEntitlements();
  const [refreshKey, setRefreshKey] = useState(0);
  const jobQuery = useQuery({
    ...jobQueryOptions(jobId ?? 'missing-job'),
    enabled: Boolean(jobId),
  });

  const backLabel = from === 'activity' ? 'Activity' : 'Jobs';
  const returnFromJob = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(from === 'activity' ? '/activity' : '/jobs');
  };

  const openLegacyFlow = (
    legacyScreen: JobLegacyScreen,
    params: { receiptId?: string; recordId?: string } = {}
  ) => {
    if (!jobQuery.data) {
      return;
    }

    router.push({
      pathname: '/',
      params: {
        jobId: jobQuery.data.id,
        jobIds: jobQuery.data.id,
        legacyScreen,
        returnContext: from === 'activity' ? 'activity' : 'jobs',
        returnPath: `/jobs/${jobQuery.data.id}`,
        ...params,
      },
    });
  };

  return (
    <AuthenticatedRoute>
      <RoutedScreenFrame>
        {jobId && jobQuery.isPending ? (
          <ScreenLayout backLabel={backLabel} onBack={returnFromJob} title="Job">
            <View style={styles.messageScreen}>
              <ActivityIndicator color={colors.primaryGreen} size="large" />
              <Text style={styles.messageText}>Loading job...</Text>
            </View>
          </ScreenLayout>
        ) : null}

        {jobQuery.error || !jobId ? (
          <ScreenLayout backLabel={backLabel} onBack={returnFromJob} title="Job">
            <View style={styles.messageScreen}>
              <Text style={styles.errorText}>
                {getUserFacingError(jobQuery.error, 'Unable to open this job. Return to Jobs.')}
              </Text>
            </View>
          </ScreenLayout>
        ) : null}

        {jobQuery.data ? (
          <JobDashboardScreen
            backLabel={backLabel}
            job={jobQuery.data}
            onAddUpdate={() => openLegacyFlow('addUpdate')}
            onBack={returnFromJob}
            onCreateInvoice={() => openLegacyFlow('invoiceDraft')}
            onEditHours={(recordId) => openLegacyFlow('editHours', { recordId })}
            onEditJob={() => openLegacyFlow('editJob')}
            onEditNote={(recordId) => openLegacyFlow('editNote', { recordId })}
            onEditPayment={(recordId) => openLegacyFlow('editPayment', { recordId })}
            onExportReport={() => openLegacyFlow('jobReport')}
            onReviewReceipt={(receiptId) => openLegacyFlow('reviewReceipt', { receiptId })}
            onShoppingList={() => openLegacyFlow('shoppingList')}
            onTasksChanged={() => {
              setRefreshKey((current) => current + 1);
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: serverStateKeys.job(jobQuery.data.id) }),
                queryClient.invalidateQueries({ queryKey: serverStateKeys.jobs }),
                queryClient.invalidateQueries({ queryKey: serverStateKeys.activity }),
              ]);
            }}
            refreshKey={refreshKey}
            showShoppingList={hasFeature('core.shopping')}
          />
        ) : null}
      </RoutedScreenFrame>
    </AuthenticatedRoute>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  messageScreen: {
    alignItems: 'center',
    backgroundColor: colors.appBackground,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  messageText: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
  },
});
