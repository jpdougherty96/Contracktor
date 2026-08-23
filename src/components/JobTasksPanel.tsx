import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { confirmAction } from '@/src/lib/confirmAction';
import {
  changeJobTask,
  createJobTask,
  fetchJobTasks,
  type JobTask,
  type JobTaskAction,
} from '@/src/lib/jobTasks';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { colors } from '@/src/styles/theme';

type JobTasksPanelProps = {
  jobId: string;
  onChanged?: () => void;
  refreshKey?: number;
};

export function JobTasksPanel({ jobId, onChanged, refreshKey = 0 }: JobTasksPanelProps) {
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === 'open'), [tasks]);
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'completed'),
    [tasks]
  );
  const cancelledTasks = useMemo(
    () => tasks.filter((task) => task.status === 'cancelled'),
    [tasks]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setTasks(await fetchJobTasks(jobId));
    } catch (loadError) {
      setError(getUserFacingError(loadError, 'Unable to load job tasks. Try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleAdd = async () => {
    if (isAdding || busyTaskId) {
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      const createdTask = await createJobTask(jobId, newTaskTitle);
      setNewTaskTitle('');
      setTasks((current) => sortTasks([...current, createdTask]));
      onChanged?.();
    } catch (saveError) {
      setError(getUserFacingError(saveError, 'Unable to add task. Try again.'));
    } finally {
      setIsAdding(false);
    }
  };

  const startEditing = (task: JobTask) => {
    setError(null);
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const stopEditing = () => {
    setEditingTaskId(null);
    setEditingTitle('');
  };

  const handleChange = async (
    task: JobTask,
    action: JobTaskAction,
    options: { title?: string } = {}
  ) => {
    if (busyTaskId || isAdding) {
      return;
    }

    if (action === 'cancel') {
      const confirmed = await confirmAction({
        cancelLabel: 'Keep task',
        confirmLabel: 'Cancel task',
        message: `Cancel “${task.title}”? Its history will be preserved.`,
        title: 'Cancel this task?',
      });

      if (!confirmed) {
        return;
      }
    }

    setBusyTaskId(task.id);
    setError(null);

    try {
      const updatedTask = await changeJobTask(task, action, options);
      setTasks((current) =>
        sortTasks(current.map((candidate) => (candidate.id === updatedTask.id ? updatedTask : candidate)))
      );

      if (editingTaskId === task.id) {
        stopEditing();
      }

      onChanged?.();
    } catch (saveError) {
      setError(getUserFacingError(saveError, 'Unable to update task. Refresh and try again.'));
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tasks</Text>
          <Text style={styles.subtitle}>
            {openTasks.length === 0
              ? 'No planned work is currently open.'
              : `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        {isLoading ? <ActivityIndicator color={colors.primaryGreen} /> : null}
      </View>

      {error ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorPanel}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && openTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather color={colors.live} name="check-circle" size={22} />
          <Text style={styles.emptyText}>Everything currently planned is handled.</Text>
        </View>
      ) : null}

      {openTasks.length > 0 ? (
        <View style={styles.taskList}>
          <Text style={styles.sectionLabel}>TO DO</Text>
          {openTasks.map((task) => (
            <TaskRow
              editingTitle={editingTitle}
              isBusy={busyTaskId === task.id}
              isEditing={editingTaskId === task.id}
              key={task.id}
              onCancel={() => handleChange(task, 'cancel')}
              onCancelEditing={stopEditing}
              onChangeEditingTitle={setEditingTitle}
              onEdit={() => startEditing(task)}
              onSaveEdit={() => handleChange(task, 'rename', { title: editingTitle })}
              onToggle={() => handleChange(task, 'complete')}
              task={task}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="New job task"
          editable={!isAdding && !busyTaskId}
          maxLength={240}
          onChangeText={setNewTaskTitle}
          onSubmitEditing={handleAdd}
          placeholder="Add task..."
          placeholderTextColor={colors.mutedText}
          returnKeyType="done"
          style={styles.addInput}
          value={newTaskTitle}
        />
        <Pressable
          accessibilityLabel="Add job task"
          disabled={isAdding || Boolean(busyTaskId)}
          onPress={handleAdd}
          style={[styles.addButton, isAdding || busyTaskId ? styles.disabled : null]}>
          {isAdding ? (
            <ActivityIndicator color={colors.warmWhite} size="small" />
          ) : (
            <Feather color={colors.warmWhite} name="plus" size={21} />
          )}
        </Pressable>
      </View>

      {completedTasks.length > 0 ? (
        <View style={styles.closedSection}>
          <Text style={styles.sectionLabel}>COMPLETED</Text>
          {completedTasks.slice(0, 8).map((task) => (
            <TaskRow
              isBusy={busyTaskId === task.id}
              key={task.id}
              onToggle={() => handleChange(task, 'reopen')}
              task={task}
            />
          ))}
        </View>
      ) : null}

      {cancelledTasks.length > 0 ? (
        <View style={styles.cancelledSummary}>
          <Text style={styles.cancelledText}>
            {cancelledTasks.length} cancelled task{cancelledTasks.length === 1 ? '' : 's'} preserved in history
          </Text>
          {cancelledTasks.slice(0, 3).map((task) => (
            <Pressable
              accessibilityLabel={`Reopen cancelled task ${task.title}`}
              disabled={Boolean(busyTaskId)}
              key={task.id}
              onPress={() => handleChange(task, 'reopen')}
              style={styles.cancelledRow}>
              <Text numberOfLines={1} style={styles.cancelledTitle}>{task.title}</Text>
              <Text style={styles.reopenText}>Reopen</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TaskRow({
  editingTitle = '',
  isBusy,
  isEditing = false,
  onCancel,
  onCancelEditing,
  onChangeEditingTitle,
  onEdit,
  onSaveEdit,
  onToggle,
  task,
}: {
  editingTitle?: string;
  isBusy: boolean;
  isEditing?: boolean;
  onCancel?: () => void;
  onCancelEditing?: () => void;
  onChangeEditingTitle?: (value: string) => void;
  onEdit?: () => void;
  onSaveEdit?: () => void;
  onToggle: () => void;
  task: JobTask;
}) {
  const isCompleted = task.status === 'completed';

  return (
    <View style={[styles.taskRow, isCompleted ? styles.completedRow : null]}>
      <Pressable
        accessibilityLabel={`${isCompleted ? 'Reopen' : 'Complete'} task ${task.title}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted, disabled: isBusy }}
        disabled={isBusy}
        onPress={onToggle}
        style={[styles.checkButton, isCompleted ? styles.checkedButton : null]}>
        {isBusy ? (
          <ActivityIndicator color={isCompleted ? colors.warmWhite : colors.primaryGreen} size="small" />
        ) : isCompleted ? (
          <Feather color={colors.warmWhite} name="check" size={17} />
        ) : null}
      </Pressable>

      {isEditing ? (
        <View style={styles.editWrap}>
          <TextInput
            autoFocus
            maxLength={240}
            onChangeText={onChangeEditingTitle}
            onSubmitEditing={onSaveEdit}
            returnKeyType="done"
            style={styles.editInput}
            value={editingTitle}
          />
          <Pressable accessibilityLabel="Save task title" onPress={onSaveEdit} style={styles.iconButton}>
            <Feather color={colors.primaryGreen} name="check" size={18} />
          </Pressable>
          <Pressable accessibilityLabel="Stop editing task" onPress={onCancelEditing} style={styles.iconButton}>
            <Feather color={colors.mutedText} name="x" size={18} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.taskText}>
            <Text style={[styles.taskTitle, isCompleted ? styles.completedTitle : null]}>
              {task.title}
            </Text>
            {isCompleted && task.completed_at ? (
              <Text style={styles.taskMeta}>Completed {formatTaskDate(task.completed_at)}</Text>
            ) : null}
          </View>
          {onEdit ? (
            <Pressable accessibilityLabel={`Edit task ${task.title}`} disabled={isBusy} onPress={onEdit} style={styles.iconButton}>
              <Feather color={colors.mutedText} name="edit-2" size={17} />
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable accessibilityLabel={`Cancel task ${task.title}`} disabled={isBusy} onPress={onCancel} style={styles.iconButton}>
              <Feather color={colors.mutedText} name="x" size={18} />
            </Pressable>
          ) : null}
          {isCompleted ? (
            <Text style={styles.reopenText}>Reopen</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function sortTasks(tasks: JobTask[]): JobTask[] {
  const statusOrder: Record<string, number> = { open: 0, completed: 1, cancelled: 2 };

  return [...tasks].sort((left, right) => {
    const statusDifference =
      (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return left.status === 'open'
      ? left.created_at.localeCompare(right.created_at)
      : right.updated_at.localeCompare(left.updated_at);
  });
}

function formatTaskDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 14,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  sectionLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  taskList: {
    gap: 8,
  },
  taskRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  completedRow: {
    backgroundColor: '#F3F6F3',
  },
  checkButton: {
    alignItems: 'center',
    borderColor: colors.primaryGreen,
    borderRadius: 7,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkedButton: {
    backgroundColor: colors.primaryGreen,
  },
  taskText: {
    flex: 1,
  },
  taskTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  completedTitle: {
    color: colors.mutedText,
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  iconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  addRow: {
    alignItems: 'center',
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 8,
  },
  addInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 4,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  disabled: {
    opacity: 0.6,
  },
  closedSection: {
    gap: 8,
    marginTop: 4,
  },
  cancelledSummary: {
    borderTopColor: colors.standardBorder,
    borderTopWidth: 1,
    gap: 6,
    paddingTop: 10,
  },
  cancelledText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
  },
  cancelledRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 36,
  },
  cancelledTitle: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  reopenText: {
    color: colors.primaryGreen,
    fontSize: 12,
    fontWeight: '900',
  },
  editWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  editInput: {
    borderBottomColor: colors.primaryGreen,
    borderBottomWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    minHeight: 40,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#F3F6F3',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  emptyText: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  errorPanel: {
    alignItems: 'center',
    backgroundColor: '#FFF1EF',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  retryButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  retryText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
});
