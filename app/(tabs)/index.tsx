import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEntitlements } from '@/src/contexts/EntitlementsContext';
import { ScreenBackProvider } from '@/src/contexts/BackNavigationContext';
import { getCurrentAuthState, signOut } from '@/src/lib/auth';
import type { GlobalActivityItem } from '@/src/lib/globalActivity';
import {
  clearPasswordRecoveryRequested,
  hasPendingPasswordRecoveryRequest,
} from '@/src/lib/passwordRecovery';
import { setReceiptDraftDestination } from '@/src/lib/receipts';
import {
  globalActivityQueryOptions,
  jobQueryOptions,
  serverStateKeys,
} from '@/src/lib/serverState';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { AddExpenseMethodScreen } from '@/src/screens/AddExpenseMethodScreen';
import { AddHoursScreen } from '@/src/screens/AddHoursScreen';
import { AddManualExpenseScreen } from '@/src/screens/AddManualExpenseScreen';
import { AddNoteScreen } from '@/src/screens/AddNoteScreen';
import { AddPaymentScreen } from '@/src/screens/AddPaymentScreen';
import { AddReceiptScreen, pickWebReceiptImage } from '@/src/screens/AddReceiptScreen';
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
import { ShoppingListScreen } from '@/src/screens/ShoppingListScreen';
import { TellContracktorScreen } from '@/src/screens/TellContracktorScreen';
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
  | 'shoppingList'
  | 'tellContracktor'
  | 'toolsInventory'
  | 'updatePassword';

const routedLegacyScreens = new Set<Screen>([
  'addUpdate',
  'createJob',
  'editHours',
  'editJob',
  'editNote',
  'editPayment',
  'invoiceDraft',
  'jobReport',
  'reviewReceipt',
  'selectJobsForReceiptEdit',
  'shoppingList',
  'toolsInventory',
]);

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const legacyParams = useLocalSearchParams<{
    inventory?: string;
    jobId?: string;
    jobIds?: string;
    legacyScreen?: string;
    receiptId?: string;
    recordId?: string;
    returnContext?: string;
    returnPath?: string;
  }>();
  const { width: viewportWidth } = useWindowDimensions();
  const { hasFeature, refresh: refreshEntitlements } = useEntitlements();
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedHoursId, setSelectedHoursId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [initialReceiptAsset, setInitialReceiptAsset] = useState<ImagePickerAsset | null>(null);
  const [selectedReceiptJobs, setSelectedReceiptJobs] = useState<Job[]>([]);
  const [isSelectedReceiptInventoryMode, setIsSelectedReceiptInventoryMode] = useState(false);
  const [receiptEditInitialInventorySelected, setReceiptEditInitialInventorySelected] = useState(false);
  const [receiptEditInitialJobIds, setReceiptEditInitialJobIds] = useState<string[]>([]);
  const [addBackScreen, setAddBackScreen] = useState<Screen>('home');
  const [addCompleteScreen, setAddCompleteScreen] = useState<Screen>('home');
  const [createBackScreen, setCreateBackScreen] = useState<Screen>('home');
  const [editBackScreen, setEditBackScreen] = useState<Screen>('dashboard');
  const [receiptReviewBackScreen, setReceiptReviewBackScreen] = useState<Screen>('dashboard');
  const [updatePasswordBackScreen, setUpdatePasswordBackScreen] = useState<Screen>('home');
  const [accountSettingsBackScreen, setAccountSettingsBackScreen] = useState<Screen>('home');
  const [dashboardBackScreen, setDashboardBackScreen] = useState<Screen>('jobs');
  const [toolsBackScreen, setToolsBackScreen] = useState<Screen>('home');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [globalErrorMessage, setGlobalErrorMessage] = useState<string | null>(null);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [isLegacyRouteLoading, setIsLegacyRouteLoading] = useState(
    Boolean(legacyParams.legacyScreen)
  );
  const legacyRequestRef = useRef<string | null>(null);
  const isPasswordRecoveryFlowRef = useRef(false);
  const canUseActivity = hasFeature('activity.feed');
  const canUseSmartAllocation = hasFeature('receipt.smart_allocation');
  const canUseShopping = hasFeature('core.shopping');
  const canUseTell = hasFeature('tell.basic');
  const activitySummaryQuery = useQuery({
    ...globalActivityQueryOptions(),
    enabled: Boolean(session && canUseActivity),
  });
  const needsReviewCount = activitySummaryQuery.data?.needsReviewCount ?? 0;
  const returnToRoutedOrigin = useCallback(
    (returnPath: string | null) => {
      if (!returnPath) {
        return false;
      }

      // The legacy flow was pushed on top of its originating route, so that route is
      // still on the stack. Dismiss back to it instead of replacing, which would leave
      // a duplicate entry and make the first Back press look like it did nothing.
      const dismissOrReplace = (href: Parameters<typeof router.replace>[0]) => {
        if (router.canDismiss()) {
          router.dismissTo(href);
          return;
        }

        router.replace(href);
      };

      if (returnPath.startsWith('/jobs/')) {
        dismissOrReplace({
          pathname: '/jobs/[jobId]',
          params: {
            from: legacyParams.returnContext === 'activity' ? 'activity' : 'jobs',
            jobId: returnPath.slice('/jobs/'.length),
          },
        });
        return true;
      }

      dismissOrReplace(returnPath === '/activity' ? '/activity' : '/jobs');
      return true;
    },
    [legacyParams.returnContext, router]
  );

  const handleSystemBack = useCallback(() => {
    let target: Screen | null = null;

    if (isJobPickerScreen(screen)) {
      target =
        screen === 'selectJobsForReceiptEdit'
          ? selectedReceiptId &&
            selectedReceiptJobs.length === 0 &&
            !isSelectedReceiptInventoryMode
            ? 'home'
            : 'reviewReceipt'
          : 'home';
    } else {
      target = getSystemBackScreen(screen, {
        addBackScreen,
        accountSettingsBackScreen,
        createBackScreen,
        dashboardBackScreen,
        editBackScreen,
        receiptReviewBackScreen,
        selectedJob,
        toolsBackScreen,
        updatePasswordBackScreen,
      });
    }

    if (!target) {
      return false;
    }

    if (
      screen === legacyParams.legacyScreen &&
      returnToRoutedOrigin(getLegacyReturnPath(legacyParams.returnPath))
    ) {
      return true;
    }

    setScreen(target);
    return true;
  }, [
    addBackScreen,
    accountSettingsBackScreen,
    createBackScreen,
    dashboardBackScreen,
    editBackScreen,
    receiptReviewBackScreen,
    screen,
    isSelectedReceiptInventoryMode,
    legacyParams.legacyScreen,
    legacyParams.returnPath,
    returnToRoutedOrigin,
    selectedJob,
    selectedReceiptId,
    selectedReceiptJobs.length,
    toolsBackScreen,
    updatePasswordBackScreen,
  ]);
  const renderScreen = (content: ReactNode) => (
    <ScreenBackProvider
      key={screen}
      onBack={session && screen !== 'home' ? handleSystemBack : null}
      screenKey={screen}>
      <View style={styles.appShell}>
        <View style={[styles.screenFrame, viewportWidth >= 768 && styles.desktopScreenFrame]}>
          {content}
        </View>
        {noticeMessage ? (
          <View accessibilityLiveRegion="polite" style={styles.noticeToast}>
            <Text style={styles.noticeToastText}>{noticeMessage}</Text>
          </View>
        ) : null}
        {globalErrorMessage ? (
          <View accessibilityLiveRegion="assertive" style={styles.errorToast}>
            <Text style={styles.errorToastText}>{globalErrorMessage}</Text>
          </View>
        ) : null}
      </View>
    </ScreenBackProvider>
  );

  useEffect(() => {
    if (!noticeMessage) {
      return;
    }

    const timeoutId = setTimeout(() => setNoticeMessage(null), 3500);
    return () => clearTimeout(timeoutId);
  }, [noticeMessage]);

  useEffect(() => {
    if (!globalErrorMessage) {
      return;
    }

    const timeoutId = setTimeout(() => setGlobalErrorMessage(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [globalErrorMessage]);

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
          setAuthError(getUserFacingError(error, 'Unable to load your session. Try again.'));
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
    if (session) {
      void refreshEntitlements();
    }
  }, [refreshEntitlements, session]);

  useEffect(() => {
    if (screen === 'activity' && !canUseActivity) {
      setScreen('home');
      return;
    }

    if (screen === 'shoppingList' && !canUseShopping) {
      setScreen(selectedJob ? 'dashboard' : 'home');
      return;
    }

    if (screen === 'tellContracktor' && !canUseTell) {
      setScreen(selectedJob ? 'dashboard' : 'home');
    }
  }, [canUseActivity, canUseShopping, canUseTell, screen, selectedJob]);

  useEffect(() => {
    if (session && canUseActivity && dashboardRefreshKey + jobsRefreshKey > 0) {
      void queryClient.invalidateQueries({ queryKey: serverStateKeys.activity });
    }
  }, [canUseActivity, dashboardRefreshKey, jobsRefreshKey, queryClient, session]);

  const finishLegacyFlow = useCallback(
    (fallbackScreen: Screen) => {
      if (returnToRoutedOrigin(getLegacyReturnPath(legacyParams.returnPath))) {
        return;
      }

      setScreen(fallbackScreen);
    },
    [legacyParams.returnPath, returnToRoutedOrigin]
  );

  const invalidateRoutedData = useCallback(
    (jobId?: string | null) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: serverStateKeys.jobs }),
        queryClient.invalidateQueries({ queryKey: serverStateKeys.activity }),
      ];

      if (jobId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: serverStateKeys.job(jobId) })
        );
      }

      return Promise.all(invalidations);
    },
    [queryClient]
  );

  useEffect(() => {
    const requestedScreen = legacyParams.legacyScreen;

    if (!session || !requestedScreen || !isRoutedLegacyScreen(requestedScreen)) {
      setIsLegacyRouteLoading(false);
      return;
    }

    const requestSignature = [
      requestedScreen,
      legacyParams.inventory,
      legacyParams.jobId,
      legacyParams.jobIds,
      legacyParams.receiptId,
      legacyParams.recordId,
      legacyParams.returnContext,
      legacyParams.returnPath,
    ].join('|');

    if (legacyRequestRef.current === requestSignature) {
      return;
    }

    legacyRequestRef.current = requestSignature;
    let isMounted = true;

    const requestedJobIds = Array.from(
      new Set(
        [legacyParams.jobId, ...(legacyParams.jobIds?.split(',') ?? [])].filter(
          (value): value is string => Boolean(value?.trim())
        )
      )
    );
    // The originating route already warmed these; only block on a spinner when it didn't.
    const hasCachedJobs = requestedJobIds.every((jobId) =>
      Boolean(queryClient.getQueryData(serverStateKeys.job(jobId)))
    );

    setIsLegacyRouteLoading(!hasCachedJobs);

    const openRequestedFlow = async () => {
      try {
        const requestedJobs = await Promise.all(
          requestedJobIds.map((jobId) => queryClient.ensureQueryData(jobQueryOptions(jobId)))
        );
        const primaryJob =
          requestedJobs.find((job) => job.id === legacyParams.jobId) ?? requestedJobs[0] ?? null;

        if (!isMounted) {
          return;
        }

        if (requiresJobForLegacyScreen(requestedScreen) && !primaryJob) {
          throw new Error('This flow requires a job.');
        }

        if (
          ['editHours', 'editNote', 'editPayment'].includes(requestedScreen) &&
          !legacyParams.recordId
        ) {
          throw new Error('This flow requires a record.');
        }

        if (
          ['reviewReceipt', 'selectJobsForReceiptEdit'].includes(requestedScreen) &&
          !legacyParams.receiptId
        ) {
          throw new Error('This flow requires a receipt.');
        }

        const returnScreen: Screen =
          legacyParams.returnPath === '/activity'
            ? 'activity'
            : legacyParams.returnPath === '/jobs'
              ? 'jobs'
              : 'dashboard';

        setSelectedJob(primaryJob);
        setSelectedReceiptJobs(requestedJobs);
        setIsSelectedReceiptInventoryMode(legacyParams.inventory === 'true');
        setSelectedHoursId(requestedScreen === 'editHours' ? legacyParams.recordId ?? null : null);
        setSelectedNoteId(requestedScreen === 'editNote' ? legacyParams.recordId ?? null : null);
        setSelectedPaymentId(requestedScreen === 'editPayment' ? legacyParams.recordId ?? null : null);
        setSelectedReceiptId(legacyParams.receiptId ?? null);
        setCreateBackScreen(returnScreen);
        setDashboardBackScreen(returnScreen);
        setEditBackScreen(returnScreen);
        setReceiptReviewBackScreen(returnScreen);
        setToolsBackScreen(returnScreen);

        if (requestedScreen === 'selectJobsForReceiptEdit') {
          setReceiptEditInitialJobIds(requestedJobs.map((job) => job.id));
          setReceiptEditInitialInventorySelected(legacyParams.inventory === 'true');
        }

        setScreen(requestedScreen);
      } catch (error) {
        if (isMounted) {
          setGlobalErrorMessage(getUserFacingError(error, 'Unable to open that screen. Try again.'));
          setScreen('home');
        }
      } finally {
        if (isMounted) {
          setIsLegacyRouteLoading(false);
        }
      }
    };

    void openRequestedFlow();

    return () => {
      isMounted = false;
    };
  }, [
    legacyParams.inventory,
    legacyParams.jobId,
    legacyParams.jobIds,
    legacyParams.legacyScreen,
    legacyParams.receiptId,
    legacyParams.recordId,
    legacyParams.returnContext,
    legacyParams.returnPath,
    queryClient,
    session,
  ]);

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
      setGlobalErrorMessage(getUserFacingError(error, 'Unable to log out. Try again.'));
    }
  };

  const handleOpenActivityItem = (item: GlobalActivityItem) => {
    setSelectedJob(item.job ?? null);

    if (item.receiptId) {
      if (!item.needsReview && item.label === 'Receipt secured') {
        return;
      }

      setSelectedReceiptId(item.receiptId);
      if (item.reviewReason === 'Choose where this receipt belongs') {
        setSelectedJob(null);
        setSelectedReceiptJobs([]);
        setIsSelectedReceiptInventoryMode(false);
        setReceiptEditInitialJobIds([]);
        setReceiptEditInitialInventorySelected(false);
        setReceiptReviewBackScreen('activity');
        setScreen('selectJobsForReceiptEdit');
        return;
      }

      setSelectedReceiptJobs(item.receiptJobs ?? (item.job ? [item.job] : []));
      setIsSelectedReceiptInventoryMode(
        item.receiptIncludesInventoryDestination ?? !item.job
      );
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
      setDashboardBackScreen('activity');
      setScreen('dashboard');
      return;
    }

    if (item.type === 'expense') {
      setToolsBackScreen('activity');
      setScreen('toolsInventory');
    }
  };

  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return renderScreen(<AuthScreen configError={authError} />);
  }

  if (isLegacyRouteLoading) {
    return <LoadingScreen />;
  }

  if (
    (screen === 'activity' && !canUseActivity) ||
    (screen === 'shoppingList' && !canUseShopping) ||
    (screen === 'tellContracktor' && !canUseTell)
  ) {
    return <LoadingScreen />;
  }

  if (screen === 'updatePassword') {
    return renderScreen(
      <UpdatePasswordScreen
        onBack={() => {
          if (isPasswordRecoveryFlowRef.current) {
            void signOut().finally(() => {
              isPasswordRecoveryFlowRef.current = false;
              clearPasswordRecoveryRequested();
              setScreen('home');
            });
            return;
          }

          setScreen(updatePasswordBackScreen);
        }}
        onSaved={() => {
          isPasswordRecoveryFlowRef.current = false;
          clearPasswordRecoveryRequested();
          setNoticeMessage('Password updated.');
          setScreen(updatePasswordBackScreen);
        }}
      />
    );
  }

  if (screen === 'accountSettings') {
    return renderScreen(
      <AccountSettingsScreen
        onBack={() => setScreen(accountSettingsBackScreen)}
        onChangePassword={() => {
          setUpdatePasswordBackScreen('accountSettings');
          setScreen('updatePassword');
        }}
        onSaved={() => setDashboardRefreshKey((key) => key + 1)}
      />
    );
  }

  if (screen === 'activity' && canUseActivity) {
    return renderScreen(
      <ActivityScreen
        onBack={() => setScreen('home')}
        onChanged={() => setDashboardRefreshKey((key) => key + 1)}
        onOpenItem={handleOpenActivityItem}
        refreshKey={dashboardRefreshKey + jobsRefreshKey}
      />
    );
  }

  if (screen === 'home') {
    return renderScreen(
      <HomeActionsScreen
        needsReviewCount={needsReviewCount}
        onAddJob={() => {
          setCreateBackScreen('home');
          setScreen('createJob');
        }}
        onAccountSettings={() => {
          setAccountSettingsBackScreen('home');
          setScreen('accountSettings');
        }}
        onCaptureReceipt={() => {
          const webCapture =
            Platform.OS === 'web'
              ? pickWebReceiptImage({ capture: 'environment' })
              : null;

          setInitialReceiptAsset(null);
          setSelectedJob(null);
          setSelectedReceiptId(null);
          setSelectedReceiptJobs([]);
          setIsSelectedReceiptInventoryMode(false);
          setAddBackScreen('home');
          setAddCompleteScreen('home');
          setScreen('addReceipt');

          if (webCapture) {
            void webCapture
              .then((asset) => {
                if (asset) {
                  setInitialReceiptAsset(asset);
                }
              })
              .catch((error) => {
                setGlobalErrorMessage(
                  getUserFacingError(error, 'Unable to open that receipt photo. Try again.')
                );
              });
          }
        }}
        onGoToActivity={() => router.push('/activity')}
        onGoToJobs={() => router.push('/jobs')}
        onStartWork={() => router.push('/start-work')}
        onTellContracktor={() => {
          setSelectedJob(null);
          setScreen('tellContracktor');
        }}
        onTimerStopped={(jobName) => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage(`${jobName} timer stopped and its time was recorded.`);
        }}
        onLogout={handleLogout}
        showActivity={canUseActivity}
        showTellContracktor={canUseTell}
        userEmail={session.user.email}
      />
    );
  }

  if (isJobPickerScreen(screen)) {
    return renderScreen(
      <JobPickerScreen
        actionLabel={getJobPickerActionLabel(screen)}
        compactJobCards={screen === 'selectJobForNote'}
        emptyDetail={getJobPickerEmptyDetail(screen)}
        includeInventoryOption={screen === 'selectJobForExpense' || screen === 'selectJobsForReceiptEdit'}
        initialInventorySelected={
          screen === 'selectJobsForReceiptEdit' ? receiptEditInitialInventorySelected : false
        }
        initialSelectedJobIds={screen === 'selectJobsForReceiptEdit' ? receiptEditInitialJobIds : []}
        multiSelect={screen === 'selectJobForExpense' || screen === 'selectJobsForReceiptEdit'}
        onBack={() => {
          if (
            screen === 'selectJobsForReceiptEdit' &&
            legacyParams.legacyScreen === 'selectJobsForReceiptEdit' &&
            getLegacyReturnPath(legacyParams.returnPath)
          ) {
            finishLegacyFlow(receiptReviewBackScreen);
            return;
          }

          if (
            screen === 'selectJobsForReceiptEdit' &&
            selectedReceiptId &&
            selectedReceiptJobs.length === 0 &&
            !isSelectedReceiptInventoryMode
          ) {
            setScreen('home');
            return;
          }

          setScreen(screen === 'selectJobsForReceiptEdit' ? 'reviewReceipt' : 'home');
        }}
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
        onSelectJobs={async (jobs, includesInventory = false) => {
          if (jobs.length === 0 && !includesInventory) {
            return;
          }

          setSelectedJob(jobs[0] ?? null);
          setSelectedReceiptJobs(jobs);
          setIsSelectedReceiptInventoryMode(includesInventory);

          if (screen === 'selectJobsForReceiptEdit') {
            if (selectedReceiptId && jobs.length === 1 && !includesInventory) {
              await setReceiptDraftDestination(selectedReceiptId, jobs[0].id).catch((error) => {
                setGlobalErrorMessage(
                  getUserFacingError(error, 'Unable to save receipt destination.')
                );
              });
            }
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
          if (screen === 'selectJobsForReceiptEdit') {
            if (selectedReceiptId) {
              void setReceiptDraftDestination(selectedReceiptId, null).catch((error) => {
                setGlobalErrorMessage(
                  getUserFacingError(error, 'Unable to save receipt destination.')
                );
              });
            }
            setScreen('reviewReceipt');
            return;
          }

          setAddBackScreen(screen);
          setAddCompleteScreen('toolsInventory');
          setScreen('addExpenseMethod');
        }}
        refreshKey={jobsRefreshKey}
        pickerContext={screen === 'selectJobForPayment' ? 'payment' : 'default'}
        title={getJobPickerTitle(screen)}
      />
    );
  }

  if (screen === 'dashboard' && selectedJob) {
    return renderScreen(
      <JobDashboardScreen
        job={selectedJob}
        onBack={() => finishLegacyFlow(dashboardBackScreen)}
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
        onShoppingList={() => setScreen('shoppingList')}
        onTasksChanged={() => setDashboardRefreshKey((key) => key + 1)}
        refreshKey={dashboardRefreshKey}
        showShoppingList={canUseShopping}
      />
    );
  }

  if (screen === 'shoppingList' && selectedJob && canUseShopping) {
    return renderScreen(
      <ShoppingListScreen
        contextJob={selectedJob}
        onBack={() => finishLegacyFlow('dashboard')}
        onChanged={() => setDashboardRefreshKey((key) => key + 1)}
      />
    );
  }

  if (screen === 'invoiceDraft' && selectedJob) {
    return renderScreen(
      <InvoiceDraftScreen
        job={selectedJob}
        onBack={() => finishLegacyFlow('dashboard')}
        onEditBusinessProfile={() => {
          setAccountSettingsBackScreen('invoiceDraft');
          setScreen('accountSettings');
        }}
      />
    );
  }

  if (screen === 'jobReport' && selectedJob) {
    return renderScreen(
      <JobReportScreen job={selectedJob} onBack={() => finishLegacyFlow('dashboard')} />
    );
  }

  if (screen === 'toolsInventory') {
    return renderScreen(
      <ToolsInventoryScreen
        onAddManualExpense={() => {
          setSelectedJob(null);
          setIsSelectedReceiptInventoryMode(true);
          setAddBackScreen('toolsInventory');
          setAddCompleteScreen('toolsInventory');
          setScreen('addExpenseMethod');
        }}
        onBack={() => finishLegacyFlow(toolsBackScreen)}
      />
    );
  }

  if (screen === 'tellContracktor' && canUseTell) {
    return renderScreen(
      <TellContracktorScreen
        contextJob={selectedJob}
        onBack={() => setScreen(selectedJob ? 'dashboard' : 'home')}
        onDone={() => {
          setDashboardRefreshKey((key) => key + 1);
          setScreen(selectedJob ? 'dashboard' : 'home');
        }}
      />
    );
  }

  if (screen === 'addExpenseMethod' && (selectedJob || isSelectedReceiptInventoryMode)) {
    return renderScreen(
      <AddExpenseMethodScreen
        contextLabel={isSelectedReceiptInventoryMode ? 'Tools / Inventory' : selectedJob?.name ?? 'Job expense'}
        onBack={() => setScreen(addBackScreen)}
        onManualExpense={() => setScreen('addManualExpense')}
        onReceipt={() => setScreen('addReceipt')}
      />
    );
  }

  if (screen === 'editHours' && selectedJob && selectedHoursId) {
    return renderScreen(
      <EditHoursScreen
        hoursId={selectedHoursId}
        job={selectedJob}
        onBack={() => finishLegacyFlow(editBackScreen)}
        onDeleted={() => {
          setSelectedHoursId(null);
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Hours entry removed.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(editBackScreen);
        }}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Hours updated.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(editBackScreen);
        }}
      />
    );
  }

  if (screen === 'editNote' && selectedJob && selectedNoteId) {
    return renderScreen(
      <EditNoteScreen
        job={selectedJob}
        noteId={selectedNoteId}
        onBack={() => finishLegacyFlow(editBackScreen)}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Note updated.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(editBackScreen);
        }}
      />
    );
  }

  if (screen === 'editPayment' && selectedJob && selectedPaymentId) {
    return renderScreen(
      <EditPaymentScreen
        job={selectedJob}
        onBack={() => finishLegacyFlow(editBackScreen)}
        onSaved={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Payment updated.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(editBackScreen);
        }}
        paymentId={selectedPaymentId}
      />
    );
  }

  if (screen === 'editJob' && selectedJob) {
    return renderScreen(
      <EditJobScreen
        job={selectedJob}
        onCancel={() => finishLegacyFlow('dashboard')}
        onSaved={(job) => {
          setSelectedJob(job);
          setJobsRefreshKey((key) => key + 1);
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Job updated.');
          queryClient.setQueryData(serverStateKeys.job(job.id), job);
          void invalidateRoutedData(job.id);
          finishLegacyFlow('dashboard');
        }}
      />
    );
  }

  if (screen === 'reviewReceipt' && selectedReceiptId) {
    const isInventoryOnlyReceipt = isSelectedReceiptInventoryMode && !selectedJob;
    const receiptJobs =
      isInventoryOnlyReceipt
        ? []
        : selectedReceiptJobs.length > 0
          ? selectedReceiptJobs
          : selectedJob
            ? [selectedJob]
            : [];

    return renderScreen(
      <ReceiptReviewScreen
        enableSmartAllocation={canUseSmartAllocation}
        includeInventoryDestination={isSelectedReceiptInventoryMode}
        inventoryMode={isInventoryOnlyReceipt}
        job={selectedJob}
        jobs={receiptJobs}
        onBack={() => finishLegacyFlow(receiptReviewBackScreen)}
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
          const completeScreen = getReceiptCompleteScreen(
            selectedReceiptJobs,
            isSelectedReceiptInventoryMode,
            canUseActivity
          );

          if (
            completeScreen === 'dashboard' &&
            ['activity', 'home', 'jobs'].includes(receiptReviewBackScreen)
          ) {
            setDashboardBackScreen(receiptReviewBackScreen);
          }

          setNoticeMessage('Receipt saved.');
          void invalidateRoutedData(selectedJob?.id);
          finishLegacyFlow(completeScreen);
        }}
        receiptId={selectedReceiptId}
      />
    );
  }

  if (screen === 'addUpdate' && selectedJob) {
    return renderScreen(
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
        onBack={() => finishLegacyFlow('dashboard')}
      />
    );
  }

  if (screen === 'addReceipt') {
    const isInventoryOnlyReceipt = isSelectedReceiptInventoryMode && !selectedJob;

    return renderScreen(
      <AddReceiptScreen
        autoStartCamera={
          addBackScreen === 'home' &&
          !selectedJob &&
          selectedReceiptJobs.length === 0 &&
          !isSelectedReceiptInventoryMode
        }
        backLabel={getAddBackLabel(addBackScreen)}
        doneLabel={getAddDoneLabel(addCompleteScreen)}
        includeInventoryDestination={isSelectedReceiptInventoryMode}
        initialAsset={initialReceiptAsset}
        inventoryMode={isInventoryOnlyReceipt}
        job={selectedJob}
        jobs={isInventoryOnlyReceipt ? [] : selectedJob && selectedReceiptJobs.length > 0 ? selectedReceiptJobs : selectedJob ? [selectedJob] : []}
        onBack={() => setScreen(addBackScreen)}
        onDone={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Receipt saved.');
          void invalidateRoutedData(selectedJob?.id);
          finishLegacyFlow(
            getReceiptCompleteScreen(
              selectedReceiptJobs,
              isSelectedReceiptInventoryMode,
              canUseActivity
            )
          );
        }}
        onInitialAssetConsumed={() => setInitialReceiptAsset(null)}
        onReviewReceipt={(receiptId) => {
          setSelectedReceiptId(receiptId);
          setDashboardRefreshKey((key) => key + 1);
          if (!selectedJob && selectedReceiptJobs.length === 0 && !isSelectedReceiptInventoryMode) {
            setReceiptEditInitialJobIds([]);
            setReceiptEditInitialInventorySelected(false);
            setReceiptReviewBackScreen('home');
            setScreen('selectJobsForReceiptEdit');
            return;
          }

          setReceiptReviewBackScreen('addReceipt');
          setScreen('reviewReceipt');
        }}
      />
    );
  }

  if (screen === 'addManualExpense' && (selectedJob || isSelectedReceiptInventoryMode)) {
    const isInventoryOnlyExpense = isSelectedReceiptInventoryMode && !selectedJob;

    return renderScreen(
      <AddManualExpenseScreen
        backLabel={getAddBackLabel(addBackScreen)}
        inventoryMode={isInventoryOnlyExpense}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Expense saved.');
          void invalidateRoutedData(selectedJob?.id);
          finishLegacyFlow(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'addHours' && selectedJob) {
    return renderScreen(
      <AddHoursScreen
        backLabel={getAddBackLabel(addBackScreen)}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Hours saved.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'addPayment' && selectedJob) {
    return renderScreen(
      <AddPaymentScreen
        backLabel={getAddBackLabel(addBackScreen)}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Payment saved.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'addNote' && selectedJob) {
    return renderScreen(
      <AddNoteScreen
        backLabel={getAddBackLabel(addBackScreen)}
        job={selectedJob}
        onBack={() => setScreen(addBackScreen)}
        onCreated={() => {
          setDashboardRefreshKey((key) => key + 1);
          setNoticeMessage('Note saved.');
          void invalidateRoutedData(selectedJob.id);
          finishLegacyFlow(addCompleteScreen);
        }}
      />
    );
  }

  if (screen === 'createJob') {
    return renderScreen(
      <CreateJobScreen
        onCancel={() => finishLegacyFlow(createBackScreen)}
        onCreated={(job) => {
          setSelectedJob(job);
          setJobsRefreshKey((key) => key + 1);

          if (getLegacyReturnPath(legacyParams.returnPath)) {
            queryClient.setQueryData(serverStateKeys.job(job.id), job);
            void invalidateRoutedData(job.id);
            setNoticeMessage('Job created.');
            router.replace({
              pathname: '/jobs/[jobId]',
              params: { from: 'jobs', jobId: job.id },
            });
            return;
          }

          if (isJobPickerScreen(createBackScreen)) {
            if (createBackScreen === 'selectJobsForReceiptEdit') {
              setReceiptEditInitialJobIds((current) =>
                Array.from(new Set([...current, job.id]))
              );
              setScreen(createBackScreen);
              return;
            }

            if (createBackScreen === 'selectJobForExpense') {
              setSelectedReceiptJobs([job]);
              setIsSelectedReceiptInventoryMode(false);
            }

            setAddBackScreen(createBackScreen);
            setAddCompleteScreen('home');
            setScreen(getAddScreenForPicker(createBackScreen));
            return;
          }

          setDashboardBackScreen(createBackScreen === 'jobs' ? 'jobs' : 'home');
          setNoticeMessage('Job created.');
          setScreen('dashboard');
        }}
      />
    );
  }

  return renderScreen(
    <JobsListScreen
      onCreateJob={() => {
        setCreateBackScreen('jobs');
        setScreen('createJob');
      }}
      onBack={() => setScreen('home')}
      onSelectJob={(job) => {
        setSelectedJob(job);
        setDashboardBackScreen('jobs');
        setScreen('dashboard');
      }}
      refreshKey={jobsRefreshKey}
    />
  );
}

function getSystemBackScreen(
  screen: Screen,
  context: {
    addBackScreen: Screen;
    accountSettingsBackScreen: Screen;
    createBackScreen: Screen;
    dashboardBackScreen: Screen;
    editBackScreen: Screen;
    receiptReviewBackScreen: Screen;
    selectedJob: Job | null;
    toolsBackScreen: Screen;
    updatePasswordBackScreen: Screen;
  }
): Screen | null {
  switch (screen) {
    case 'home':
      return null;
    case 'accountSettings':
      return context.accountSettingsBackScreen;
    case 'activity':
    case 'jobs':
      return 'home';
    case 'dashboard':
      return context.dashboardBackScreen;
    case 'addUpdate':
    case 'editJob':
    case 'invoiceDraft':
    case 'jobReport':
    case 'shoppingList':
      return 'dashboard';
    case 'addExpenseMethod':
    case 'addHours':
    case 'addManualExpense':
    case 'addNote':
    case 'addPayment':
    case 'addReceipt':
      return context.addBackScreen;
    case 'createJob':
      return context.createBackScreen;
    case 'editHours':
    case 'editNote':
    case 'editPayment':
      return context.editBackScreen;
    case 'reviewReceipt':
      return context.receiptReviewBackScreen;
    case 'tellContracktor':
      return context.selectedJob ? 'dashboard' : 'home';
    case 'toolsInventory':
      return context.toolsBackScreen;
    case 'updatePassword':
      return context.updatePasswordBackScreen;
    case 'selectJobForExpense':
    case 'selectJobForHours':
    case 'selectJobForNote':
    case 'selectJobForPayment':
      return 'home';
    case 'selectJobsForReceiptEdit':
      return 'reviewReceipt';
  }
}

function isRoutedLegacyScreen(value: string): value is Screen {
  return routedLegacyScreens.has(value as Screen);
}

function requiresJobForLegacyScreen(screen: Screen): boolean {
  return [
    'addUpdate',
    'editHours',
    'editJob',
    'editNote',
    'editPayment',
    'invoiceDraft',
    'jobReport',
    'shoppingList',
  ].includes(screen);
}

function getLegacyReturnPath(value: string | undefined): string | null {
  if (value === '/activity' || value === '/jobs') {
    return value;
  }

  if (value?.startsWith('/jobs/') && value.slice('/jobs/'.length).trim()) {
    return value;
  }

  return null;
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

function getReceiptCompleteScreen(
  receiptJobs: Job[],
  includesInventoryDestination: boolean,
  canUseActivity: boolean
): Screen {
  if (receiptJobs.length === 1 && !includesInventoryDestination) {
    return 'dashboard';
  }

  if (receiptJobs.length === 0 && includesInventoryDestination) {
    return 'toolsInventory';
  }

  return canUseActivity ? 'activity' : 'home';
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
  appShell: {
    backgroundColor: '#F6F5F2',
    flex: 1,
  },
  screenFrame: {
    flex: 1,
    width: '100%',
  },
  desktopScreenFrame: {
    alignSelf: 'center',
    maxWidth: 980,
  },
  noticeToast: {
    alignSelf: 'center',
    backgroundColor: '#294B38',
    borderRadius: 10,
    bottom: 24,
    maxWidth: 460,
    paddingHorizontal: 18,
    paddingVertical: 12,
    position: 'absolute',
  },
  noticeToastText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorToast: {
    alignSelf: 'center',
    backgroundColor: '#8F2F28',
    borderRadius: 10,
    bottom: 24,
    maxWidth: 460,
    paddingHorizontal: 18,
    paddingVertical: 12,
    position: 'absolute',
  },
  errorToastText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
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
