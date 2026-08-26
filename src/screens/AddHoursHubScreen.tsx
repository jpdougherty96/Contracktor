import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/src/components/ScreenLayout';
import { confirmAction } from '@/src/lib/confirmAction';
import { fetchJob, type StartWorkJob } from '@/src/lib/jobs';
import {
  activeTimerQueryOptions,
  serverStateKeys,
  startWorkJobsQueryOptions,
} from '@/src/lib/serverState';
import {
  startJobTimer,
  stopJobTimer,
  type ActiveTimeEntry,
} from '@/src/lib/timeClock';
import { getUserFacingError } from '@/src/lib/userFacingError';
import type { Job } from '@/src/types/job';

type AddHoursHubScreenProps = {
  initialNotice?: string | null;
  onBack: () => void;
  onManualHours: (job: Job) => void;
  refreshKey?: number;
};

export function AddHoursHubScreen({
  initialNotice = null,
  onBack,
  onManualHours,
  refreshKey = 0,
}: AddHoursHubScreenProps) {
  const queryClient = useQueryClient();
  const jobsQuery = useQuery(startWorkJobsQueryOptions());
  const activeTimerQuery = useQuery(activeTimerQueryOptions());
  const [now, setNow] = useState(() => Date.now());
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(initialNotice);

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const activeEntries = useMemo(
    () => (activeTimerQuery.data ? [activeTimerQuery.data.entry] : []),
    [activeTimerQuery.data]
  );
  const activeEntryByJobId = useMemo(() => {
    const entries = new Map<string, ActiveTimeEntry>();

    activeEntries.forEach((entry) => {
      if (entry.job_id) {
        entries.set(entry.job_id, entry);
      }
    });

    return entries;
  }, [activeEntries]);
  const detachedActiveTimer =
    activeTimerQuery.data &&
    !jobs.some((job) => job.id === activeTimerQuery.data?.entry.job_id)
      ? activeTimerQuery.data
      : null;

  useEffect(() => {
    if (refreshKey > 0) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: serverStateKeys.activeTimer }),
        queryClient.invalidateQueries({ queryKey: serverStateKeys.startWorkJobs }),
      ]);
    }
  }, [queryClient, refreshKey]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStart = async (job: StartWorkJob) => {
    const activeEntry = activeTimerQuery.data?.entry;
    const activeJob = activeEntry?.job_id
      ? jobs.find((candidate) => candidate.id === activeEntry.job_id)
      : null;

    if (activeEntry && activeEntry.job_id !== job.id) {
      const shouldSwitch = await confirmAction({
        cancelLabel: 'Keep current timer',
        confirmLabel: 'Switch timer',
        destructive: false,
        message: `This will stop ${activeJob?.name ?? 'the current job'} and record its elapsed time before starting ${job.name}.`,
        title: 'Switch active timer?',
      });

      if (!shouldSwitch) {
        return;
      }
    }

    setBusyJobId(job.id);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const entry = await startJobTimer(job);
      queryClient.setQueryData(serverStateKeys.activeTimer, {
        entry,
        jobName: job.name,
      });
      setNoticeMessage(
        activeEntry && activeEntry.job_id !== job.id
          ? `${activeJob?.name ?? 'Previous timer'} stopped. ${job.name} timer started.`
          : `${job.name} timer started.`
      );
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to start timer. Nothing was changed.'));
    } finally {
      setBusyJobId(null);
    }
  };

  const handleStop = async (jobId: string, jobName: string, entry: ActiveTimeEntry) => {
    setBusyJobId(jobId);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      await stopJobTimer(entry);
      queryClient.setQueryData(serverStateKeys.activeTimer, null);
      setNoticeMessage(`${jobName} timer stopped and its time was recorded.`);
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to stop timer. Try again.'));
    } finally {
      setBusyJobId(null);
    }
  };

  const handleManualHours = async (job: StartWorkJob) => {
    setBusyJobId(job.id);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      onManualHours(await fetchJob(job.id));
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to open manual hours. Try again.'));
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <ScreenLayout
      backDisabled={busyJobId !== null}
      backLabel="Home"
      onBack={onBack}
      title="Start work">
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.introText}>
          Choose a job to start its timer or enter hours manually.
        </Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {jobsQuery.error || activeTimerQuery.error ? (
          <Text style={styles.errorText}>
            {getUserFacingError(
              jobsQuery.error ?? activeTimerQuery.error,
              'Unable to load hours. Try again.'
            )}
          </Text>
        ) : null}
        {noticeMessage ? <Text style={styles.noticeText}>{noticeMessage}</Text> : null}
        {jobsQuery.isPending ? <Text style={styles.messageText}>Loading jobs...</Text> : null}
        {detachedActiveTimer ? (
          <View style={styles.detachedTimerCard}>
            <View style={styles.jobInfo}>
              <Text style={styles.jobName}>{detachedActiveTimer.jobName}</Text>
              <Text style={styles.detachedTimerDetail}>
                This timer is still running, but the job is no longer active.
              </Text>
            </View>
            <View style={styles.timerControls}>
              <Text style={styles.timerText}>
                {detachedActiveTimer.entry.started_at
                  ? formatElapsed(detachedActiveTimer.entry.started_at, now)
                  : '0:00'}
              </Text>
              <Pressable
                disabled={busyJobId !== null}
                onPress={() =>
                  void handleStop(
                    detachedActiveTimer.entry.job_id ?? detachedActiveTimer.entry.id,
                    detachedActiveTimer.jobName,
                    detachedActiveTimer.entry
                  )
                }
                style={[styles.timerButton, styles.stopButton]}>
                <Text style={styles.timerButtonText}>
                  {busyJobId !== null ? 'Stopping...' : 'Stop'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {!jobsQuery.isPending && jobs.length === 0 ? (
          <Text style={styles.messageText}>No open jobs are available.</Text>
        ) : null}

        {!jobsQuery.isPending && jobs.length > 0 ? (
          <View style={styles.list}>
            {jobs.map((job) => {
              const activeEntry = activeEntryByJobId.get(job.id);
              const displayHourlyRate =
                activeEntry?.hourly_rate ??
                job.hourlyRate;
              const isBusy = busyJobId !== null;
              const isThisJobBusy = busyJobId === job.id;

              return (
                <View key={job.id} style={styles.jobRow}>
                  <View style={styles.jobInfo}>
                    <Text style={styles.jobName}>{job.name}</Text>
                    <Text style={styles.clientName}>{job.clientName}</Text>
                    <Text style={styles.rateText}>
                      {displayHourlyRate
                        ? `$${displayHourlyRate.toFixed(2)}/hr`
                        : 'Hourly rate not set'}
                    </Text>
                  </View>

                  {job.timeClockEnabled ? (
                    <View style={styles.timerControls}>
                      <Text style={styles.timerText}>
                        {activeEntry?.started_at ? formatElapsed(activeEntry.started_at, now) : '0:00'}
                      </Text>
                      <Pressable
                            disabled={isBusy}
                            onPress={() =>
                              activeEntry
                                ? handleStop(job.id, job.name, activeEntry)
                                : handleStart(job)
                            }
                        style={[
                          styles.timerButton,
                          activeEntry && styles.stopButton,
                          isBusy && styles.disabledButton,
                        ]}>
                        <Text style={styles.timerButtonText}>
                          {isThisJobBusy ? 'Working...' : activeEntry ? 'Stop' : 'Start'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.disabledTimerText}>Time clock off</Text>
                  )}

                  <Pressable
                    disabled={isBusy}
                    style={[styles.manualButton, isBusy && styles.disabledButton]}
                    onPress={() => void handleManualHours(job)}>
                    <Text style={styles.manualButtonText}>Enter hours manually</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}

function formatElapsed(startedAt: string, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  introText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    marginBottom: 16,
  },
  list: {
    gap: 14,
  },
  jobRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  jobInfo: {
    gap: 3,
  },
  jobName: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '800',
  },
  clientName: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  rateText: {
    color: '#7C6F64',
    fontSize: 13,
    fontWeight: '700',
  },
  timerControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  timerText: {
    color: '#1F2933',
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
  },
  timerButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 104,
    paddingHorizontal: 18,
  },
  stopButton: {
    backgroundColor: '#B91C1C',
  },
  disabledButton: {
    opacity: 0.7,
  },
  timerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledTimerText: {
    color: '#7C6F64',
    fontSize: 14,
    fontWeight: '800',
  },
  detachedTimerCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    marginBottom: 14,
    padding: 16,
  },
  detachedTimerDetail: {
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  manualButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  manualButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  noticeText: {
    color: '#335C43',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
  },
  messageText: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
  },
});
