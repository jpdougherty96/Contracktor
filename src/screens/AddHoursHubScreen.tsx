import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmAction } from '@/src/lib/confirmAction';
import { fetchJobs } from '@/src/lib/jobs';
import {
  fetchActiveTimeEntries,
  fetchTimeClockDefaults,
  startJobTimer,
  stopJobTimer,
  type ActiveTimeEntry,
  type TimeClockDefaults,
} from '@/src/lib/timeClock';
import { getUserFacingError } from '@/src/lib/userFacingError';
import type { Job } from '@/src/types/job';

type AddHoursHubScreenProps = {
  onBack: () => void;
  onManualHours: (job: Job) => void;
  refreshKey?: number;
};

export function AddHoursHubScreen({
  onBack,
  onManualHours,
  refreshKey = 0,
}: AddHoursHubScreenProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeEntries, setActiveEntries] = useState<ActiveTimeEntry[]>([]);
  const [timerDefaultsByJobId, setTimerDefaultsByJobId] = useState<
    Record<string, TimeClockDefaults>
  >({});
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const openJobs = useMemo(
    () => jobs.filter((job) => !['completed', 'closed'].includes(job.status.toLowerCase())),
    [jobs]
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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [nextJobs, nextActiveEntries] = await Promise.all([
        fetchJobs(),
        fetchActiveTimeEntries(),
      ]);
      const nextTimerDefaults = Object.fromEntries(
        await Promise.all(
          nextJobs.map(async (job) => [job.id, await fetchTimeClockDefaults(job)] as const)
        )
      );

      setJobs(nextJobs);
      setActiveEntries(nextActiveEntries);
      setTimerDefaultsByJobId(nextTimerDefaults);
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to load hours. Try again.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStart = async (job: Job) => {
    const activeEntry = activeEntries[0];
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
      const entry = await startJobTimer(job, timerDefaultsByJobId[job.id]);
      setActiveEntries([entry]);
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

  const handleStop = async (job: Job, entry: ActiveTimeEntry) => {
    setBusyJobId(job.id);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      await stopJobTimer(entry);
      setActiveEntries((currentEntries) =>
        currentEntries.filter((currentEntry) => currentEntry.id !== entry.id)
      );
      await loadData();
      setNoticeMessage(`${job.name} timer stopped and its time was recorded.`);
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to stop timer. Try again.'));
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable disabled={busyJobId !== null} style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back home</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Start work</Text>
          <Text style={styles.subtitle}>Choose a job to start its timer or enter hours manually.</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {noticeMessage ? <Text style={styles.noticeText}>{noticeMessage}</Text> : null}
        {isLoading ? <Text style={styles.messageText}>Loading jobs...</Text> : null}
        {!isLoading && openJobs.length === 0 ? (
          <Text style={styles.messageText}>No open jobs are available.</Text>
        ) : null}

        {!isLoading && openJobs.length > 0 ? (
          <View style={styles.list}>
            {openJobs.map((job) => {
              const activeEntry = activeEntryByJobId.get(job.id);
              const displayHourlyRate =
                activeEntry?.hourly_rate ??
                timerDefaultsByJobId[job.id]?.hourlyRate ??
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
                          activeEntry ? handleStop(job, activeEntry) : handleStart(job)
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
                    onPress={() => onManualHours(job)}>
                    <Text style={styles.manualButtonText}>Enter hours manually</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: 8,
    minHeight: 44,
  },
  backButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '800',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: '#1F2933',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
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
