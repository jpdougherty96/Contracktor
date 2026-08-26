import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  activeTimerQueryOptions,
  serverStateKeys,
  startWorkJobsQueryOptions,
} from '@/src/lib/serverState';
import { stopJobTimer } from '@/src/lib/timeClock';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { colors, radii } from '@/src/styles/theme';

type HomeActionsScreenProps = {
  needsReviewCount?: number;
  onAddJob: () => void;
  onAccountSettings?: () => void;
  onCaptureReceipt: () => void;
  onGoToActivity: () => void;
  onGoToJobs: () => void;
  onStartWork: () => void;
  onTellContracktor: () => void;
  onTimerStopped?: (jobName: string) => void;
  onLogout?: () => void;
  showActivity?: boolean;
  showTellContracktor?: boolean;
  userEmail?: string;
};

const primaryActions = [
  {
    description: 'Current and completed jobs, history, and financials.',
    icon: 'grid',
    key: 'jobs',
    label: 'Jobs',
  },
  {
    description: 'See what conTRACKtor handled and what needs you.',
    icon: 'activity',
    key: 'activity',
    label: 'Recent activity',
  },
  {
    description: 'Start tracking a new project.',
    icon: 'plus',
    key: 'job',
    label: 'Add new job',
  },
] as const;

export function HomeActionsScreen({
  needsReviewCount = 0,
  onAddJob,
  onAccountSettings,
  onCaptureReceipt,
  onGoToActivity,
  onGoToJobs,
  onStartWork,
  onTellContracktor,
  onTimerStopped,
  onLogout,
  showActivity = false,
  showTellContracktor = false,
  userEmail,
}: HomeActionsScreenProps) {
  const queryClient = useQueryClient();
  const activeTimerQuery = useQuery(activeTimerQueryOptions());
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [timerErrorMessage, setTimerErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const livePulse = useRef(new Animated.Value(1)).current;
  const activeTimer = activeTimerQuery.data ?? null;
  const stopTimerMutation = useMutation({
    mutationFn: stopJobTimer,
    onSuccess: () => {
      queryClient.setQueryData(serverStateKeys.activeTimer, null);
    },
  });
  const isStoppingTimer = stopTimerMutation.isPending;

  useEffect(() => {
    void queryClient.prefetchQuery(startWorkJobsQueryOptions());
  }, [queryClient]);

  useEffect(() => {
    if (activeTimerQuery.error) {
      setTimerErrorMessage(
        getUserFacingError(
          activeTimerQuery.error,
          'Unable to load the active timer. Try Start Work to check it.'
        )
      );
    }
  }, [activeTimerQuery.error]);

  useEffect(() => {
    if (!activeTimer) {
      return;
    }

    const intervalId = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(intervalId);
  }, [activeTimer]);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) {
        setReduceMotionEnabled(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!activeTimer || reduceMotionEnabled) {
      livePulse.stopAnimation();
      livePulse.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.4,
          useNativeDriver: true,
        }),
        Animated.timing(livePulse, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [activeTimer, livePulse, reduceMotionEnabled]);

  const handlePress = (key: (typeof primaryActions)[number]['key']) => {
    if (key === 'job') {
      onAddJob();
      return;
    }

    if (key === 'activity') {
      onGoToActivity();
      return;
    }

    onGoToJobs();
  };

  const handleStopTimer = async (event: GestureResponderEvent) => {
    event.stopPropagation();

    if (!activeTimer || isStoppingTimer) {
      return;
    }

    const timerToStop = activeTimer;
    setTimerErrorMessage(null);

    try {
      await stopTimerMutation.mutateAsync(timerToStop.entry);
      onTimerStopped?.(timerToStop.jobName);
    } catch (error) {
      setTimerErrorMessage(getUserFacingError(error, 'Unable to stop timer. Try again.'));
    }
  };

  const elapsed = activeTimer ? formatElapsed(activeTimer.entry.started_at, now) : null;
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTitle}>
                <Text style={styles.appName}>conTRACKtor</Text>
                <Text style={styles.subtitle}>
                  Capture what happened. Know where every job stands.
                </Text>
              </View>
              {onLogout ? (
                <Pressable
                  accessibilityLabel="Account"
                  style={styles.accountButton}
                  onPress={() => setIsAccountOpen((current) => !current)}>
                  <Feather color={colors.mutedText} name="user" size={22} />
                </Pressable>
              ) : null}
            </View>
            {onLogout && isAccountOpen ? (
              <View style={styles.accountPanel}>
                {userEmail ? <Text style={styles.accountEmail}>{userEmail}</Text> : null}
                {onAccountSettings ? (
                  <Pressable style={styles.accountMenuButton} onPress={onAccountSettings}>
                    <Text style={styles.accountMenuButtonText}>Account settings</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.logoutButton} onPress={onLogout}>
                  <Text style={styles.logoutButtonText}>Log out</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.reflexZone}>
            <Pressable
              onPress={onCaptureReceipt}
              style={styles.captureButton}>
              <View style={styles.captureIconBlock}>
                <Feather color={colors.warmWhite} name="camera" size={30} />
              </View>
              <View style={styles.captureText}>
                <Text style={styles.captureLabel}>Capture receipt</Text>
                <Text style={styles.captureDescription}>
                  Open the camera first. Choose the job after.
                </Text>
              </View>
            </Pressable>

            {showTellContracktor ? (
              <Pressable
                onPress={onTellContracktor}
                style={styles.tellButton}>
                <View style={styles.tellIconBlock}>
                  <Feather color={colors.primaryGreen} name="message-circle" size={30} />
                </View>
                <View style={styles.captureText}>
                  <Text style={styles.tellLabel}>Tell conTRACKtor</Text>
                  <Text style={styles.tellDescription}>
                    Type or dictate what happened. Add photos if useful.
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {activeTimer && elapsed ? (
              <View
                style={[
                  styles.workButton,
                  styles.activeWorkButton,
                ]}>
                <Pressable
                  accessibilityLabel={`${activeTimer.jobName} timer running, ${elapsed}. Open Start Work.`}
                  accessibilityRole="button"
                  onPress={onStartWork}
                  style={styles.activeWorkMain}>
                  <View style={styles.workIconBlock}>
                    <Feather color={colors.warmWhite} name="clock" size={30} />
                    <Animated.View style={[styles.iconLiveDot, { opacity: livePulse }]} />
                  </View>
                  <View style={styles.workText}>
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={[styles.workLabel, styles.activeWorkLabel]}>
                      {activeTimer.jobName}
                    </Text>
                    <View style={styles.runningRow}>
                      <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
                      <Text numberOfLines={1} style={styles.workDescription}>
                        Running · {elapsed}
                      </Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Stop timer for ${activeTimer.jobName}`}
                  accessibilityRole="button"
                  accessibilityState={{ busy: isStoppingTimer, disabled: isStoppingTimer }}
                  disabled={isStoppingTimer}
                  onPress={(event) => void handleStopTimer(event)}
                  style={[
                    styles.stopChip,
                    isStoppingTimer && styles.stopChipBusy,
                  ]}>
                  <Text style={styles.stopChipText}>
                    {isStoppingTimer ? 'Stopping…' : 'Stop'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityLabel="Start work"
                accessibilityRole="button"
                onPress={onStartWork}
                style={[
                  styles.workButton,
                  styles.idleWorkButton,
                ]}>
                <View style={styles.workIconBlock}>
                  <Feather color={colors.warmWhite} name="play" size={30} />
                </View>
                <View style={styles.workText}>
                  <Text style={styles.workLabel}>Start work</Text>
                  <Text style={styles.workDescription}>
                    Start a job timer or enter labor manually.
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {timerErrorMessage ? (
            <Text accessibilityLiveRegion="assertive" style={styles.timerErrorText}>
              {timerErrorMessage}
            </Text>
          ) : null}

          {needsReviewCount > 0 ? (
            <Pressable
              accessibilityLabel={`Open ${needsReviewCount} ${needsReviewCount === 1 ? 'thing' : 'things'} needing attention`}
              accessibilityRole="button"
              onPress={onGoToActivity}
              style={styles.attentionLine}>
              <Feather color={colors.warning} name="alert-triangle" size={21} />
              <Text style={styles.attentionText}>
                {needsReviewCount} {needsReviewCount === 1 ? 'thing needs' : 'things need'} your attention
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionLabel}>Your jobs</Text>

          <View style={styles.actionList}>
            {primaryActions
              .filter((action) => action.key !== 'activity' || showActivity)
              .map((action) => (
                <Pressable
                  key={action.key}
                  onPress={() => handlePress(action.key)}
                  style={styles.actionButton}>
                  <View style={styles.iconBlock}>
                    <Feather color={colors.warmWhite} name={action.icon} size={28} />
                  </View>
                  <View style={styles.actionText}>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                    <Text style={styles.actionDescription}>{action.description}</Text>
                  </View>
                </Pressable>
              ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 980,
    paddingHorizontal: 4,
    paddingTop: 12,
    width: '100%',
  },
  header: {
    marginBottom: 28,
  },
  headerTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
  },
  appName: {
    color: colors.primaryGreen,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 6,
  },
  accountButton: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  accountPanel: {
    alignSelf: 'flex-end',
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
    minWidth: 190,
    padding: 12,
  },
  accountEmail: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
  },
  accountMenuButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 42,
  },
  accountMenuButtonText: {
    color: colors.warmWhite,
    fontSize: 14,
    fontWeight: '800',
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: colors.strongBorder,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  logoutButtonText: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '800',
  },
  reflexZone: {
    width: '100%',
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
    minHeight: 96,
    padding: 16,
  },
  tellButton: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderColor: colors.primaryGreen,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
    minHeight: 96,
    padding: 16,
  },
  workButton: {
    backgroundColor: colors.text,
    borderRadius: 16,
    flexDirection: 'row',
    marginBottom: 26,
    minHeight: 96,
  },
  idleWorkButton: {
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  activeWorkButton: {
    alignItems: 'center',
    gap: 14,
    paddingRight: 16,
  },
  activeWorkMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 96,
    minWidth: 0,
    paddingLeft: 16,
    paddingVertical: 16,
  },
  captureIconBlock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.16)',
    borderRadius: 14,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  tellIconBlock: {
    alignItems: 'center',
    backgroundColor: '#E9F0EA',
    borderRadius: 14,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  workIconBlock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.14)',
    borderRadius: 14,
    height: 62,
    justifyContent: 'center',
    position: 'relative',
    width: 62,
  },
  captureText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  captureLabel: {
    color: colors.warmWhite,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 32,
  },
  captureDescription: {
    color: '#E8EFE8',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  tellLabel: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 32,
  },
  tellDescription: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  workLabel: {
    color: colors.warmWhite,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 32,
  },
  workDescription: {
    color: '#E8E5DE',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  workText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  activeWorkLabel: {
    fontSize: 23,
    lineHeight: 28,
  },
  runningRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  liveDot: {
    backgroundColor: colors.live,
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  iconLiveDot: {
    backgroundColor: colors.live,
    borderColor: colors.text,
    borderRadius: 999,
    borderWidth: 2,
    height: 14,
    position: 'absolute',
    right: -3,
    top: -3,
    width: 14,
  },
  stopChip: {
    alignItems: 'center',
    borderColor: colors.strongBorder,
    borderRadius: radii.button,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 68,
    paddingHorizontal: 12,
  },
  stopChipBusy: {
    opacity: 0.65,
  },
  stopChipText: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '900',
  },
  timerErrorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 18,
    marginTop: -10,
  },
  attentionLine: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: -10,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  attentionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
    marginBottom: 12,
  },
  actionList: {
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconBlock: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  actionText: {
    flex: 1,
    gap: 4,
  },
  actionLabel: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
  },
  actionDescription: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
});

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) {
    return '0m';
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 60_000)
  );
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
