import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/src/styles/theme';

type HomeActionsScreenProps = {
  needsReviewCount?: number;
  onAddExpense: () => void;
  onAddHours: () => void;
  onAddJob: () => void;
  onAddNote: () => void;
  onAddPayment: () => void;
  onAccountSettings?: () => void;
  onGoToActivity: () => void;
  onGoToJobs: () => void;
  onGoToToolsInventory: () => void;
  onLogout?: () => void;
  userEmail?: string;
};

const primaryActions = [
  {
    description: 'See active jobs, budgets, receipts, and hours.',
    icon: 'grid',
    key: 'dashboard',
    label: 'Job dashboard',
  },
  {
    description: 'Review recent work and items that need attention.',
    icon: 'activity',
    key: 'activity',
    label: 'Recent activity',
  },
  {
    description: 'Scan a receipt or enter an expense manually.',
    icon: 'file-text',
    key: 'expense',
    label: 'Add expense',
  },
  {
    description: 'Log labor against an active job.',
    icon: 'clock',
    key: 'hours',
    label: 'Add hours',
  },
  {
    description: 'Record money received from a client.',
    icon: 'dollar-sign',
    key: 'payment',
    label: 'Add payment',
  },
  {
    description: 'Save a job note, photo, or reminder.',
    icon: 'clipboard',
    key: 'note',
    label: 'Add note',
  },
  {
    description: 'Review non-job tool and inventory purchases.',
    icon: 'archive',
    key: 'toolsInventory',
    label: 'Tools / Inventory',
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
  onAddExpense,
  onAddHours,
  onAddJob,
  onAddNote,
  onAddPayment,
  onAccountSettings,
  onGoToActivity,
  onGoToJobs,
  onGoToToolsInventory,
  onLogout,
  userEmail,
}: HomeActionsScreenProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const handlePress = (key: (typeof primaryActions)[number]['key']) => {
    if (key === 'expense') {
      onAddExpense();
      return;
    }

    if (key === 'hours') {
      onAddHours();
      return;
    }

    if (key === 'payment') {
      onAddPayment();
      return;
    }

    if (key === 'note') {
      onAddNote();
      return;
    }

    if (key === 'job') {
      onAddJob();
      return;
    }

    if (key === 'toolsInventory') {
      onGoToToolsInventory();
      return;
    }

    if (key === 'activity') {
      onGoToActivity();
      return;
    }

    onGoToJobs();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerTitle}>
                <Text style={styles.appName}>conTRACKtor</Text>
                <Text style={styles.subtitle}>
                  Keep job receipts, hours, and payments in one place.
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

          <Text style={styles.heading}>What do you need to update?</Text>

          <View style={styles.actionList}>
            {primaryActions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => handlePress(action.key)}
                style={styles.actionButton}>
                <View style={styles.iconBlock}>
                  <Feather color={colors.warmWhite} name={action.icon} size={28} />
                </View>
                <View style={styles.actionText}>
                  <View style={styles.actionLabelRow}>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                    {action.key === 'activity' && needsReviewCount > 0 ? (
                      <View style={styles.reviewBadge}>
                        <Text style={styles.reviewBadgeText}>{needsReviewCount}</Text>
                      </View>
                    ) : null}
                  </View>
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
  heading: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 28,
    marginBottom: 16,
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
  actionLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  reviewBadge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 7,
  },
  reviewBadgeText: {
    color: colors.warmWhite,
    fontSize: 13,
    fontWeight: '900',
  },
});
