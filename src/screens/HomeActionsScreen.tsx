import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/src/styles/theme';

type HomeActionsScreenProps = {
  needsReviewCount?: number;
  onAddJob: () => void;
  onAccountSettings?: () => void;
  onCaptureReceipt: () => void;
  onGoToActivity: () => void;
  onGoToJobs: () => void;
  onStartWork: () => void;
  onTellContracktor: () => void;
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
  onLogout,
  showActivity = false,
  showTellContracktor = false,
  userEmail,
}: HomeActionsScreenProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

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

          <Text style={styles.heading}>Capture what happened</Text>

          <Pressable onPress={onCaptureReceipt} style={styles.captureButton}>
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
            <Pressable onPress={onTellContracktor} style={styles.tellButton}>
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

          <Pressable onPress={onStartWork} style={styles.workButton}>
            <View style={styles.workIconBlock}>
              <Feather color={colors.warmWhite} name="play" size={30} />
            </View>
            <View style={styles.captureText}>
              <Text style={styles.workLabel}>Start work</Text>
              <Text style={styles.workDescription}>
                Start a job timer or enter labor manually.
              </Text>
            </View>
          </Pressable>

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
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 26,
    minHeight: 96,
    padding: 16,
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
    width: 62,
  },
  captureText: {
    flex: 1,
    gap: 4,
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
