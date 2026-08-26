import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthenticatedRoute } from '@/src/components/AuthenticatedRoute';
import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { ScreenLayout } from '@/src/components/ScreenLayout';
import { fetchJob } from '@/src/lib/jobs';
import { serverStateKeys } from '@/src/lib/serverState';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { AddHoursScreen } from '@/src/screens/AddHoursScreen';
import { colors } from '@/src/styles/theme';

export default function NewHoursRoute() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const queryClient = useQueryClient();
  const returnToStartWork = () => router.replace('/start-work');
  const jobQuery = useQuery({
    enabled: Boolean(jobId),
    queryFn: () => fetchJob(jobId!),
    queryKey: ['jobs', 'detail', jobId],
    staleTime: 30_000,
  });

  return (
    <AuthenticatedRoute>
      <RoutedScreenFrame>
        {jobId && jobQuery.isPending ? (
          <ScreenLayout backLabel="Start work" onBack={returnToStartWork} title="Add hours">
            <View style={styles.messageScreen}>
              <ActivityIndicator color={colors.primaryGreen} size="large" />
              <Text style={styles.messageText}>Loading job...</Text>
            </View>
          </ScreenLayout>
        ) : null}
        {jobQuery.error || !jobId ? (
          <ScreenLayout backLabel="Start work" onBack={returnToStartWork} title="Add hours">
            <View style={styles.messageScreen}>
              <Text style={styles.errorText}>
                {getUserFacingError(jobQuery.error, 'Unable to open this job. Return to Start Work.')}
              </Text>
            </View>
          </ScreenLayout>
        ) : null}
        {jobQuery.data ? (
          <AddHoursScreen
            backLabel="Back to Start work"
            guardRouteRemoval
            job={jobQuery.data}
            onBack={() => router.back()}
            onCreated={() => {
              void queryClient.invalidateQueries({ queryKey: serverStateKeys.startWorkJobs });
              router.replace({
                pathname: '/start-work',
                params: { notice: `${jobQuery.data.name} hours recorded.` },
              });
            }}
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
