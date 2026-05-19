import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  acceptExtractedReceipt,
  createProcessingReceipt,
  extractReceipt,
  fetchPotentialDuplicateReceipts,
  uploadReceiptPhoto,
} from '@/src/lib/receipts';
import type { Job } from '@/src/types/job';

type AddReceiptScreenProps = {
  backLabel?: string;
  doneLabel?: string;
  job: Job;
  jobs?: Job[];
  onBack: () => void;
  onDone: () => void;
  onReviewReceipt: (receiptId: string) => void;
};

type ReceiptStep = 'idle' | 'uploading' | 'extracting' | 'complete';

const unclearReceiptMessage =
  "We couldn't read the vendor, date, and total from this receipt. Please retake a clearer photo.";

export function AddReceiptScreen({
  backLabel = 'Back to updates',
  doneLabel = 'Back to dashboard',
  job,
  jobs,
  onBack,
  onDone,
  onReviewReceipt,
}: AddReceiptScreenProps) {
  const [step, setStep] = useState<ReceiptStep>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const receiptJobs = jobs && jobs.length > 0 ? jobs : [job];

  const isBusy = step === 'uploading' || step === 'extracting';

  const processReceiptAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setStep('uploading');
      setMessage('Uploading receipt photo...');

      const upload = await uploadReceiptPhoto(job.id, asset);
      const receipt = await createProcessingReceipt(
        job.id,
        upload.storagePath,
        upload.originalFilename
      );

      setStep('extracting');
      setMessage('Reading receipt...');

      const extraction = await extractReceipt(receipt.id);

      if (extraction.receipt.status === 'error' || extraction.receipt.review_status === 'error') {
        setStep('idle');
        setMessage(null);
        setErrorMessage(extraction.receipt.error_message ?? unclearReceiptMessage);
        return;
      }

      if ((extraction.line_items ?? []).length > 0) {
        onReviewReceipt(extraction.receipt.id);
        return;
      }

      if (receiptJobs.length > 1) {
        onReviewReceipt(extraction.receipt.id);
        return;
      }

      const duplicates = await fetchPotentialDuplicateReceipts(extraction.receipt);

      if (
        extraction.receipt.status !== 'accepted' ||
        extraction.receipt.review_status !== 'reviewed' ||
        duplicates.length > 0
      ) {
        onReviewReceipt(extraction.receipt.id);
        return;
      }

      await acceptExtractedReceipt(extraction.receipt);
      setStep('complete');
      setMessage('Receipt saved.');
      onDone();
      return;

    } catch (error) {
      setStep('idle');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add receipt.');
    }
  };

  const handleTakePhoto = async () => {
    setMessage(null);
    setErrorMessage(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Camera permission is required to add a receipt photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    await processReceiptAsset(result.assets[0]);
  };

  const handleChoosePhoto = async () => {
    setMessage(null);
    setErrorMessage(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      base64: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    await processReceiptAsset(result.assets[0]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={onBack} disabled={isBusy}>
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Add receipt</Text>
          <Text style={styles.subtitle}>{formatReceiptJobs(receiptJobs)}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Receipt photo</Text>
          <Text style={styles.panelText}>
            Take a clear photo of the full receipt. The app will upload it and start extraction.
          </Text>

          {message ? <Text style={styles.messageText}>{message}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            disabled={isBusy}
            onPress={handleTakePhoto}
            style={[styles.primaryButton, isBusy && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>
              {isBusy ? 'Working...' : step === 'complete' ? 'Retake receipt photo' : 'Take receipt photo'}
            </Text>
          </Pressable>

          <Pressable
            disabled={isBusy}
            onPress={handleChoosePhoto}
            style={[styles.uploadButton, isBusy && styles.disabledButton]}>
            <Text style={styles.uploadButtonText}>Upload existing photo</Text>
          </Pressable>

          {step === 'complete' ? (
            <Pressable style={styles.secondaryButton} onPress={onDone}>
              <Text style={styles.secondaryButtonText}>{doneLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatReceiptJobs(jobs: Job[]): string {
  if (jobs.length === 1) {
    return jobs[0].name;
  }

  return `${jobs.length} jobs selected`;
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
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  panelTitle: {
    color: '#1F2933',
    fontSize: 20,
    fontWeight: '800',
  },
  panelText: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
  },
  messageText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '800',
  },
  uploadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  uploadButtonText: {
    color: '#335C43',
    fontSize: 14,
    fontWeight: '800',
  },
});
