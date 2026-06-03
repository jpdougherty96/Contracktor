import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrentAuthState, signOut } from '@/src/lib/auth';
import { fetchGlobalActivity, type GlobalActivityItem } from '@/src/lib/globalActivity';
import {
  clearPasswordRecoveryRequested,
  hasPendingPasswordRecoveryRequest,
} from '@/src/lib/passwordRecovery';
import { AddExpenseMethodScreen } from '@/src/screens/AddExpenseMethodScreen';
import { AddHoursHubScreen } from '@/src/screens/AddHoursHubScreen';
import { AddHoursScreen } from '@/src/screens/AddHoursScreen';
import { AddManualExpenseScreen } from '@/src/screens/AddManualExpenseScreen';
import { AddNoteScreen } from '@/src/screens/AddNoteScreen';
import { AddPaymentScreen } from '@/src/screens/AddPaymentScreen';
import { AddReceiptScreen } from '@/src/screens/AddReceiptScreen';
import { AddUpdateScreen } from '@/src/screens/AddUpdateScreen';
import { AccountSettingsScreen } from '@/src/screens/AccountSettingsScreen';
import { ActivityScreen } from '@/src/screens/ActivityScreen';
import { AuthScreen } from '@/src/screens/AuthScreen';
import { CreateJobScreen } from '@/src/screens/CreateJobScreen';
import { EditHoursScreen } from '@/src/screens/EditHoursScreen';
import { EditJobScreen } from '@/src/screens/EditJobScreen';
import { EditNoteScreen } from '@/src/screens/EditNoteScreen';
import { EditPaymentScreen } from '@/src/screens/EditPaymentScreen';
import { HomeActionsScreen } from '@/src/screens/HomeActionsScreen';
import { InvoiceDraftScreen } from '@/src/screens/InvoiceDraftScreen';
import { JobDashboardScreen } from '@/src/screens/JobDashboardScreen';
import { JobReportScreen } from '@/src/screens/JobReportScreen';
import { JobPickerScreen } from '@/src/screens/JobPickerScreen';
import { JobsListScreen } from '@/src/screens/JobsListScreen';
import { ReceiptReviewScreen } from '@/src/screens/ReceiptReviewScreen';
import { ToolsInventoryScreen } from '@/src/screens/ToolsInventoryScreen';
import { UpdatePasswordScreen } from '@/src/screens/UpdatePasswordScreen';
import type { Job } from '@/src/types/job';

type Screen =
  | 'home'
  | 'accountSettings'
  | 'activity'
  | 'jobs'
  | 'dashboard'
  | 'addUpdate'
  | 'addExpenseMethod'
  | 'addHoursHub'
  | 'addHours'
  | 'addManualExpense'
  | 'addNote'
  | 'addPayment'
  | 'addReceipt'
  | 'createJob'
  | 'editHours'
  | 'editJob'
  | 'editNote'
  | 'editPayment'
  | 'invoiceDraft'
  | 'jobReport'
  | 'reviewReceipt'
  | 'selectJobsForReceiptEdit'
  | 'selectJobForExpense'
  | 'selectJobForHours'
  | 'selectJobForNote'
  | 'selectJobForPayment'
  | 'toolsInventory'
  | 'updatePassword';

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedHoursId, setSelectedHoursId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [selectedReceiptJobs, setSelectedReceiptJobs] = useState<Job[]>([]);
  const [isSelectedReceiptInventoryMode, setIsSelectedReceiptInventoryMode] = useState(false);
  const [receiptEditInitialInventorySelected, setReceiptEditInitialInventorySelected] = useState(false);
  const [receiptEditInitialJobIds, setReceiptEditInitialJobIds] = useState<string[]>([]);
  const [addBackScreen, setAddBackScreen] = useState<Screen>('home');
  const [addCompleteScreen, setAddCompleteScreen] = useState<Screen>('home');
  const [createBackScreen, setCreateBackScreen] = useState<Screen>('home');
  const [editBackScreen, setEditBackScreen] = useState<Screen>('dashboard');
  const [receiptReviewBackScreen, setReceiptReviewBackScreen] = useState<Screen>('dashboard');
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const isPasswordRecoveryFlowRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const loadSession = async () => {
      try {
        const startsInPasswordRecoveryFlow =
          isPasswordRecoveryUrl() || hasPendingPasswordRecoveryRequest();
        isPasswordRecoveryFlowRef.current = startsInPasswordRecoveryFlow;
        const authState = await getCurrentAuthState();

        if (isMounted) {
          setSession(authState.session);
          setAuthError(null);

          if (startsInPasswordRecoveryFlow) {
            setScreen('updatePassword');
          }
        }

        const { supabase } = await import('@/src/lib/supabase');
        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
          setSession(nextSession);
          setAuthError(null);

          if (event === 'PASSWORD_RECOVERY') {
            isPasswordRecoveryFlowRef.current = true;
            setScreen('updatePassword');
            return;
          }

          if (event === 'SIGNED_OUT') {
            isPasswordRecoveryFlowRef.current = false;
            clearPasswordRecoveryRequested();
            setScreen('home');
            return;
          }

          if (isPasswordRecoveryFlowRef.current && nextSession) {
            setScreen('updatePassword');
            return;
          }

          if (event === 'SIGNED_IN') {
            setScreen('home');
          }
        });

        unsubscribe = () => data.subscription.unsubscribe();
      } catch (error) {
        if (isMounted) {
          setAuthError(error instanceof Error ? error.message : 'Unable to load auth session.');
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadNeedsReviewCount = async () => {
      if (!session) {
        setNeedsReviewCount(0);
        return;
      }

      try {
        const summary = await fetchGlobalActivity();

        if (isMounted) {
          setNeedsReviewCount(summary.needsReviewCount);
        }
      } catch {
        if (isMounted) {
          setNeedsReviewCount(0);
        }
      }
    };

    loadNeedsReviewCount();

    return () => {
      isMounted = false;
    };
  }, [dashboardRefreshKey, jobsRefreshKey, session]);

  const handleLogout = async () => {
    try {
      await signOut();
      isPasswordRecoveryFlowRef.current = false;
      clearPasswordRecoveryRequested();
      setSelectedJob(null);
      setSelectedHoursId(null);
      setSelectedNoteId(null);
      setSelectedPaymentId(null);
      setSelectedReceiptId(null);
      setSelectedReceiptJobs([]);
      setIsSelectedReceiptInventoryMode(false);
      setScreen('home');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log out.');
    }
  };

  const handleOpenActivityItem = (item: GlobalActivityItem) => {
    setSelectedJob(item.job ?? null);

    if (item.receiptId) {
      setSelectedReceiptId(item.receiptId);
      setSelectedReceiptJobs(item.job ? [item.job] : []);
      setIsSelectedReceiptInventoryMode(!item.job);
      setReceiptReviewBackScreen('activity');
      setScreen('reviewReceipt');
      return;
    }

    if (item.hoursId && item.job) {
      setSelectedHoursId(item.hoursId);
      setEditBackScreen('activity');
      setScreen('editHours');
      return;
    }

    if (item.noteId && item.job) {
      setSelectedNoteId(item.noteId);
      setEditBackScreen('activity');
      setScreen('editNote');
      return;
    }

    if (item.paymentId && item.job) {
      setSelectedPaymentId(item.paymentId);
      setEditBackScreen('activity');
      setScreen('editPayment');
      return;
    }

    if (item.job) {
      setScreen('dashboard');
      return;
    }

    if (item.type === 'expense') {
      setScreen('toolsInventory');
    }
  };

  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AuthScreen configError={authError} />;
  }

  if (screen === 'updatePassword') {
    return (
      <UpdatePasswordScreen
        onSaved={() => {
          isPasswordRecoveryFlowRef.current = false;
          clearPasswordRecoveryRequested();
          setScreen('home');
        }}
      />
    );
  }

  if (screen === 'accountSettings') {
    return (
      <AccountSettingsScreen
        onBack={() => setScreen('home')}
        onSaved={() => setDashboardRefreshKey((key) => key + 1)}
      />
    );
  }

  if (screen === 'activity') {
    return (
      <ActivityScreen
        onBack={() => setScreen('home')}
        onOpenItem={handleOpenActivityItem}
        refreshKey={dashboardRefreshKey + jobsRefreshKey}
      />
    );
  }

  if (screen === 'home') {
    return (
      <HomeActionsScreen
        needsReviewCount={needsReviewCount}
        onAddExpense={() => {
          setIsSelectedReceiptInventoryMode(false);
          setScreen('selectJobForExpense');
        }}
        onAddHours={() => setScreen('addHoursHub')}
        onAddJob={() => {
          setCreateBackScreen('home');
          setScreen('createJob');
        }}
        onAddNote={() => setScreen('selectJobForNote')}
        onAddPayment={() => setScreen('selectJobForPayment')}
        onAccountSettings={() => setScreen('accountSettings')}
        onGoToActivity={() => setScreen('activity')}
        onGoToJobs={() => setScreen('jobs')}
        onGoToToolsInventory={() => setScreen('toolsInventory')}
        onLogout={handleLogout}
        userEmail={session.user.email}
      />
    );
  }

  if (isJobPickerScreen(screen)) {
    return (
      <JobPickerScreen
        actionLabel={getJobPickerActionLabel(screen)}
        emptyDetail={getJobPickerEmptyDetail(screen)}
        includeInventoryOption={screen === 'selectJobForExpense' || screen === 'selectJobsForReceiptEdit'}
        initialInventorySelected={
          screen === 'selectJobsForReceiptEdit' ? receiptEditInitialInventorySelected : false
        }
        initialSelectedJobIds={screen === 'selectJobsForReceiptEdit' ? receiptEditInitialJobIds : []}
        multiSelect={screen === 'selectJobForExpense' || screen === 'selectJobsForReceiptEdit'}
        onBack={() => setScreen(screen === 'selectJobsForReceiptEdit' ? 'reviewReceipt' : 'home')}
        onCreateJob={() => {
          setCreateBackScreen(screen);
          setScreen('createJob');
        }}
        onSelectJob={(job) => {
          setSelectedJob(job);
          if (screen === 'selectJobForExpense') {
            setSelectedReceiptJobs([job]);
            setIsSelectedReceiptInventoryMode(false);
          }
          setAddBackScreen(screen);
          setAddCompleteScreen('home');
          setScreen(getAddScreenForPicker(screen));
        }}
        onSelectJobs={(jobs, includesInventory = false) => {
          if (jobs.length === 0 && !includesInventory) {
            return;
          }

          setSelectedJob(jobs[0] ?? null);
          setSelectedReceiptJobs(jobs);
          setIsSelectedReceiptInventoryMode(includesInventory);

          if (screen === 'selectJobsForReceiptEdit') {
            setScreen('reviewReceipt');
            return;
          }

          setAddBackScreen(screen);
          setAddCompleteScreen(includesInventory ? 'toolsInventory' : 'home');
          setScreen('addExpenseMethod');
        }}
        onSelectInventory={() => {
          setSelectedJob(null);
          setSelectedReceiptJobs([]);
          setIsSelectedReceiptInventoryMode(true);
          setAddBackScreen(screen);
          setAddCompleteScreen('toolsInventory');
          setScreen('addExpenseMethod');
        }}
        refreshKey={jobsRefreshKey}
        title={getJobPickerTitle(screen)}
      />
    );
  }

  if (screen === 'dashboard' && selectedJob) {
    return (
      <JobDashboardScreen
        job={selectedJob}
        onBack={() => setScreen('jobs')}
        onAddUpdate={() => setScreen('addUpdate')}
        onCreateInvoice={() => setScreen('invoiceDraft')}
        onEditJob={() => setScreen('editJob')}
        onExportReport={() => setScreen('jobReport')}
        onEditHours={(hoursId) => {
          setSelectedHoursId(hoursId);
          setEditBackScreen('dashboard');
          setScreen('editHours');
        }}
        onEditNote={(noteId) => {
          setSelectedNoteId(noteId);
          setEditBackScreen('dashboard');
          setScreen('editNote');
        }}
        onEditPayment={(paymentId) => {
          setSelectedPaymentId(paymentId);
          setEditBackScreen('dashboard');
          setScreen('editPayment');
        }}
        onReviewReceipt={(receiptId) => {
          setSelectedReceiptId(receiptId);
          setSelectedReceiptJobs([selectedJob]);
          setIsSelectedReceiptInventoryMode(false);
          setReceiptReviewBackScreen('dashboard');
          setScreen('reviewReceipt');
        }}
        refreshKey={dashboardRefreshKey}
      />
    );
  }

  if (screen === 'invoiceDraft' && selectedJob) {
    return <InvoiceDraftScreen job={selectedJob} onBack={() => setScreen('dashboard')} />;
  }

  if (screen === 'jobReport' && selectedJob) {
    return <JobReportScreen job={selectedJob} onBack={() => setScreen('dashboard')} />;
  }

  if (screen === 'addHoursHub') {
    return (
      <AddHoursHubScreen
        onBack={() => setScreen('home')}
        onManualHours={(job) => {
          setSelectedJob(job);
          setAddBackScreen('addHoursHub');
          setAddCompleteScreen('addHoursHub');
          setScreen('addHours');
        }}
        refreshKey={dashboardRefreshKey}
      />
    );
  }

  if (screen === 'toolsInventory') {
    return (
      <ToolsInventoryScreen
        onAddManualExpense={() => {
          setSelectedJob(null);
          setIsSelectedReceiptInventoryMode(true);
          setAddBackScreen('toolsInventory');
          setAddCompleteScreen('toolsInventory');
          setScreen('addExpenseMethod');
        }}
        onBack={() => setScreen('home')}
      />
    );
  }

  if (screen === 'addExpenseMethod' && (selectedJob || isSelectedReceiptInventoryMode)) {
    return (
      <AddExpenseMethodScreen
        contextLabel={isSelectedReceiptInventoryMode ? 'Tools / Inventory' : selectedJob?.name ?? 'Job expense'}
        onBack={() => setScreen(addBackScreen)}
        onManualExpense={() => setScreen('addManualExpense')}
        onReceipt={() => setScreen('addReceipt')}
      />
    );
  }

  if (screen === 'editHours' && selectedJob && selectedHoursId) {
    return (
      <EditHoursScreen
        hoursId={selectedHoursId}
        job={selectedJob}
        onBack={() => setScreen(editBackScreen)}
        onDeleted={() => {
          setSelectedHoursId(null);
          setDashboardRefreshKey((key) => key + 1);
          setScreen(editBackScreen);
        }}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(editBackScreen);
        }}
      />
    );
  }

  if (screen === 'editNote' && selectedJob && selectedNoteId) {
    return (
      <EditNoteScreen
        job={selectedJob}
        noteId={selectedNoteId}
        onBack={() => setScreen(editBackScreen)}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(editBackScreen);
        }}
      />
    );
  }

  if (screen === 'editPayment' && selectedJob && selectedPaymentId) {
    return (
      <EditPaymentScreen
        job={selectedJob}
        onBack={() => setScreen(editBackScreen)}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(editBackScreen);
        }}
        paymentId={selectedPaymentId}
      />
    );
  }

  if (screen === 'editJob' && selectedJob) {
    return (
      <EditJobScreen
        job={selectedJob}
        onCancel={() => setScreen('dashboard')}
        onSaved={(job) => {
          setSelectedJob(job);
          setJobsRefreshKey((key) => key + 1);
          setDashboardRefreshKey((key) => key + 1);
          setScreen('dashboard');
        }}
      />
    );
  }

  if (screen === 'reviewReceipt' && selectedReceiptId && (selectedJob || isSelectedReceiptInventoryMode)) {
    const isInventoryOnlyReceipt = isSelectedReceiptInventoryMode && !selectedJob;

    return (
      <ReceiptReviewScreen
        includeInventoryDestination={isSelectedReceiptInventoryMode}
        inventoryMode={isInventoryOnlyReceipt}
        job={selectedJob}
        jobs={isInventoryOnlyReceipt ? [] : selectedJob && selectedReceiptJobs.length > 0 ? selectedReceiptJobs : selectedJob ? [selectedJob] : []}
        onBack={() => setScreen(receiptReviewBackScreen)}
        onReviewReceipt={(receiptId) => {
          setSelectedReceiptId(receiptId);
          setScreen('reviewReceipt');
        }}
        onEditReceiptJobs={(initialJobIds, initialInventorySelected) => {
          setReceiptEditInitialJobIds(initialJobIds);
          setReceiptEditInitialInventorySelected(initialInventorySelected);
          setScreen('selectJobsForReceiptEdit');
        }}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(
            receiptReviewBackScreen === 'activity'
              ? 'activity'
              : isInventoryOnlyReceipt
                ? 'toolsInventory'
                : 'dashboard'
          );
        }}
        receiptId={selectedReceiptId}
      />
    );
  }

  if (screen === 'addUpdate' && selectedJob) {
    return (
      <AddUpdateScreen
        job={selectedJob}
        onAddExpense={() => {
          setSelectedReceiptJobs([selectedJob]);
          setIsSelectedReceiptInventoryMode(false);
          setAddBackScreen('addUpdate');
          setAddCompleteScreen('dashboard');
          setScreen('addExpenseMethod');
        }}
        onAddHours={() => {
          setAddBackScreen('addUpdate');
          setAddCompleteScreen('dashboard');
          setScreen('addHours');
        }}
        onAddNote={() => {
          setAddBackScreen('addUpdate');
          setAddCompleteScreen('dashboard');
          setScreen('addNote');
        }}
        onAddPayment={() => {
          setAddBackScreen('addUpdate');
          setAddCompleteScreen('dashboard');
          setScreen('addPayment');
        }}
        onBack={() => setScreen('dashboard')}
      />
    );
  }

  if (screen === 'addReceipt' && (selectedJob || isSelectedReceiptInventoryMode)) {
    const isInventoryOnlyReceipt = isSelectedReceiptInventoryMode && !selectedJob;

    return (
      <AddReceiptScreen
        backLabel={getAddBackLabel(addBackScreen)}
        doneLabel={getAddDoneLabel(addCompleteScreen)}
        includeInventoryDestination={isSelectedReceiptInventoryMode}
        inventoryMode={isInventoryOnlyReceipt}
        job={selectedJob}
        jobs={isInventoryOnlyReceipt ? [] : selectedJob && selectedReceiptJobs.length > 0 ? selectedReceiptJobs : selectedJob ? [selectedJob] : []}
        onBack={() => setScreen(addBackScreen)}
        onDone={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(addCompleteScreen);
        }}
        onReviewReceipt={(receiptId) => {
          setSelectedReceiptId(receiptId);
          setReceiptReviewBackScreen('addReceipt');
          setDashboardRefreshKey((key) => key + 1);
          setScreen('reviewReceipt');
        }}
      />
    );
  }

  if (screen === 'addManualExpense' && (selectedJob || isSelectedReceiptInventoryMode)) {
    const isInventoryOnlyExpense = isSelectedReceiptInventoryMode && !selectedJob;

    return (
      <AddManualExpenseScreen
        backLabel={getAddBackLabel(addBackScreen)}
        inventoryMode={isInventoryOnlyExpense}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'addHours' && selectedJob) {
    return (
      <AddHoursScreen
        backLabel={getAddBackLabel(addBackScreen)}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'addPayment' && selectedJob) {
    return (
      <AddPaymentScreen
        backLabel={getAddBackLabel(addBackScreen)}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'addNote' && selectedJob) {
    return (
      <AddNoteScreen
        backLabel={getAddBackLabel(addBackScreen)}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'createJob') {
    return (
      <CreateJobScreen
        onCancel={() => setScreen(createBackScreen)}
        onCreated={(job) => {
          setSelectedJob(job);
          setJobsRefreshKey((key) => key + 1);
          setScreen('home');
        }}
      />
    );
  }

  return (
    <JobsListScreen
      onCreateJob={() => {
        setCreateBackScreen('jobs');
        setScreen('createJob');
      }}
      onBack={() => setScreen('home')}
      onLogout={handleLogout}
      onSelectJob={(job) => {
        setSelectedJob(job);
        setScreen('dashboard');
      }}
      refreshKey={jobsRefreshKey}
      userEmail={session.user.email}
    />
  );
}

function isJobPickerScreen(
  screen: Screen
): screen is
  | 'selectJobsForReceiptEdit'
  | 'selectJobForExpense'
  | 'selectJobForHours'
  | 'selectJobForNote'
  | 'selectJobForPayment' {
  return (
    screen === 'selectJobForExpense' ||
    screen === 'selectJobsForReceiptEdit' ||
    screen === 'selectJobForHours' ||
    screen === 'selectJobForNote' ||
    screen === 'selectJobForPayment'
  );
}

function getJobPickerActionLabel(screen: Screen): string {
  if (screen === 'selectJobForExpense') {
    return 'Choose one or more jobs this receipt may apply to.';
  }

  if (screen === 'selectJobsForReceiptEdit') {
    return 'Choose the jobs or Tools / Inventory destinations this receipt should allow.';
  }

  if (screen === 'selectJobForHours') {
    return 'Choose the job for these hours.';
  }

  if (screen === 'selectJobForPayment') {
    return 'Choose the job for this payment.';
  }

  return 'Choose the job for this note.';
}

function getJobPickerTitle(screen: Screen): string {
  if (screen === 'selectJobForExpense') {
    return 'Add expense';
  }

  if (screen === 'selectJobsForReceiptEdit') {
    return 'Receipt destinations';
  }

  if (screen === 'selectJobForHours') {
    return 'Add hours';
  }

  if (screen === 'selectJobForPayment') {
    return 'Add payment';
  }

  return 'Add note';
}

function getJobPickerEmptyDetail(screen: Screen): string {
  if (screen === 'selectJobForExpense') {
    return 'Create a job before adding job expenses. Tools / Inventory purchases can be reviewed from the home screen.';
  }

  if (screen === 'selectJobsForReceiptEdit') {
    return 'Create a job before assigning receipt lines to a job.';
  }

  return 'Create a job before adding this update.';
}

function getAddScreenForPicker(
  screen:
    | 'selectJobForExpense'
    | 'selectJobsForReceiptEdit'
    | 'selectJobForHours'
    | 'selectJobForNote'
    | 'selectJobForPayment'
): Screen {
  if (screen === 'selectJobForExpense' || screen === 'selectJobsForReceiptEdit') {
    return 'addExpenseMethod';
  }

  if (screen === 'selectJobForHours') {
    return 'addHours';
  }

  if (screen === 'selectJobForPayment') {
    return 'addPayment';
  }

  return 'addNote';
}

function getAddBackLabel(screen: Screen): string {
  if (screen === 'addHoursHub') {
    return 'Back to hours';
  }

  if (isJobPickerScreen(screen)) {
    return 'Back to job selection';
  }

  if (screen === 'addUpdate') {
    return 'Back to updates';
  }

  if (screen === 'toolsInventory') {
    return 'Back to Tools / Inventory';
  }

  return 'Back home';
}

function getAddDoneLabel(screen: Screen): string {
  if (screen === 'dashboard') {
    return 'Back to dashboard';
  }

  if (screen === 'toolsInventory') {
    return 'Back to Tools / Inventory';
  }

  return 'Back home';
}

function isPasswordRecoveryUrl(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return (
    searchParams.get('authFlow') === 'password-recovery' ||
    hashParams.get('authFlow') === 'password-recovery' ||
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery' ||
    window.location.href.includes('type=recovery')
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#335C43" />
        <Text style={styles.loadingText}>Loading conTRACKtor...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
  },
});
