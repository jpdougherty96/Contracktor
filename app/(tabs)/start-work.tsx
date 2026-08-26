import { router, useLocalSearchParams } from 'expo-router';

import { AuthenticatedRoute } from '@/src/components/AuthenticatedRoute';
import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { AddHoursHubScreen } from '@/src/screens/AddHoursHubScreen';

export default function StartWorkRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();

  return (
    <AuthenticatedRoute>
      <RoutedScreenFrame>
        <AddHoursHubScreen
          initialNotice={notice}
          onBack={() => router.back()}
          onManualHours={(job) => {
            router.push({
              pathname: '/hours/new',
              params: { jobId: job.id },
            });
          }}
        />
      </RoutedScreenFrame>
    </AuthenticatedRoute>
  );
}
