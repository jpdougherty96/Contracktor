import { router } from 'expo-router';

import { AuthenticatedRoute } from '@/src/components/AuthenticatedRoute';
import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { JobsListScreen } from '@/src/screens/JobsListScreen';

export default function JobsRoute() {
  return (
    <AuthenticatedRoute>
      <RoutedScreenFrame>
        <JobsListScreen
          onBack={returnHome}
          onCreateJob={() =>
            router.push({
              pathname: '/',
              params: {
                legacyScreen: 'createJob',
                returnContext: 'jobs',
                returnPath: '/jobs',
              },
            })
          }
          onSelectJob={(job) =>
            router.push({
              pathname: '/jobs/[jobId]',
              params: { from: 'jobs', jobId: job.id },
            })
          }
        />
      </RoutedScreenFrame>
    </AuthenticatedRoute>
  );
}

function returnHome() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/');
}
