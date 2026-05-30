import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Job } from '@/src/types/job';

type AddUpdateScreenProps = {
  job: Job;
  onBack: () => void;
  onAddHours: () => void;
  onAddNote: () => void;
  onAddPayment: () => void;
  onAddExpense: () => void;
};

const updateOptions = ['Add expense', 'Add hours', 'Add payment', 'Add note'];

export function AddUpdateScreen({
  job,
  onBack,
  onAddExpense,
  onAddHours,
  onAddNote,
  onAddPayment,
}: AddUpdateScreenProps) {
  const handleOptionPress = (option: string) => {
    if (option === 'Add expense') {
      onAddExpense();
      return;
    }

    if (option === 'Add hours') {
      onAddHours();
      return;
    }

    if (option === 'Add payment') {
      onAddPayment();
      return;
    }

    onAddNote();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to dashboard</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Add update</Text>
          <Text style={styles.subtitle}>{job.name}</Text>
        </View>

        <View style={styles.buttonList}>
          {updateOptions.map((option) => (
            <Pressable
              key={option}
              style={styles.optionButton}
              onPress={() => handleOptionPress(option)}>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  container: {
    flex: 1,
    padding: 20,
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
    marginBottom: 20,
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
  buttonList: {
    gap: 14,
  },
  optionButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8D3CA',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 18,
  },
  optionText: {
    color: '#1F2933',
    fontSize: 19,
    fontWeight: '800',
  },
});
