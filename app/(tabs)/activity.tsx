import { Redirect, router } from 'expo-router';

import { AuthenticatedRoute } from '@/src/components/AuthenticatedRoute';
import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { useEntitlements } from '@/src/contexts/EntitlementsContext';
import type { GlobalActivityItem } from '@/src/lib/globalActivity';
import { ActivityScreen } from '@/src/screens/ActivityScreen';

export default function ActivityRoute() {
  const { hasFeature } = useEntitlements();

  if (!hasFeature('activity.feed')) {
    return <Redirect href="/" />;
  }

  return (
    <AuthenticatedRoute>
      <RoutedScreenFrame>
        <ActivityScreen onBack={returnHome} onOpenItem={openActivityItem} />
      </RoutedScreenFrame>
    </AuthenticatedRoute>
  );
}

function openActivityItem(item: GlobalActivityItem) {
  if (item.receiptId) {
    if (!item.needsReview && item.label === 'Receipt secured') {
      return;
    }

    const chooseDestination = item.reviewReason === 'Choose where this receipt belongs';
    router.push({
      pathname: '/',
      params: {
        inventory: item.receiptIncludesInventoryDestination ? 'true' : 'false',
        jobId: item.job?.id,
        jobIds: (item.receiptJobs ?? (item.job ? [item.job] : []))
          .map((job) => job.id)
          .join(','),
        legacyScreen: chooseDestination ? 'selectJobsForReceiptEdit' : 'reviewReceipt',
        receiptId: item.receiptId,
        returnPath: '/activity',
      },
    });
    return;
  }

  if (item.hoursId && item.job) {
    openLegacyRecord('editHours', item.job.id, item.hoursId);
    return;
  }

  if (item.noteId && item.job) {
    openLegacyRecord('editNote', item.job.id, item.noteId);
    return;
  }

  if (item.paymentId && item.job) {
    openLegacyRecord('editPayment', item.job.id, item.paymentId);
    return;
  }

  if (item.job) {
    router.push({
      pathname: '/jobs/[jobId]',
      params: { from: 'activity', jobId: item.job.id },
    });
    return;
  }

  if (item.type === 'expense') {
    router.push({
      pathname: '/',
      params: {
        legacyScreen: 'toolsInventory',
        returnPath: '/activity',
      },
    });
  }
}

function openLegacyRecord(legacyScreen: string, jobId: string, recordId: string) {
  router.push({
    pathname: '/',
    params: {
      jobId,
      legacyScreen,
      recordId,
      returnPath: '/activity',
    },
  });
}

function returnHome() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/');
}
