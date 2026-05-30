import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WebCameraCapture } from '@/src/components/WebCameraCapture';
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
  includeInventoryDestination?: boolean;
  inventoryMode?: boolean;
  job?: Job | null;
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
  includeInventoryDestination = false,
  inventoryMode = false,
  job,
  jobs,
  onBack,
  onDone,
  onReviewReceipt,
}: AddReceiptScreenProps) {
  const [step, setStep] = useState<ReceiptStep>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWebCameraOpen, setIsWebCameraOpen] = useState(false);
  const receiptJobs = jobs && jobs.length > 0 ? jobs : job ? [job] : [];

  const isBusy = step === 'uploading' || step === 'extracting';
  const isWeb = Platform.OS === 'web';
  const prefersNativeWebCamera = isWeb && isMobileWebBrowser();

  const processReceiptAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setStep('uploading');
      setMessage('Uploading receipt...');

      const contextJobId = inventoryMode ? null : job?.id;
      const upload = await uploadReceiptPhoto(contextJobId ?? null, asset);
      const receipt = await createProcessingReceipt(
        contextJobId ?? null,
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

      if (inventoryMode || includeInventoryDestination || receiptJobs.length > 1) {
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

    if (isWeb) {
      if (prefersNativeWebCamera) {
        const asset = await pickWebReceiptImage({ capture: true });

        if (asset) {
          await processReceiptAsset(asset);
        }

        return;
      }

      setIsWebCameraOpen(true);
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Camera permission is required to add a receipt photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      mediaTypes: ['images'],
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

    if (isWeb) {
      const asset = await pickWebReceiptImage({ capture: false });

      if (asset) {
        await processReceiptAsset(asset);
      }

      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      base64: true,
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    await processReceiptAsset(result.assets[0]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, isWeb && styles.webContainer]}>
        <Pressable style={styles.backButton} onPress={onBack} disabled={isBusy}>
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Add receipt</Text>
          <Text style={styles.subtitle}>
            {inventoryMode ? 'Tools / Inventory' : formatReceiptJobs(receiptJobs)}
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{isWeb ? 'Receipt file' : 'Receipt photo'}</Text>
          <Text style={styles.panelText}>
            {prefersNativeWebCamera
              ? 'Take a clear receipt photo with your phone camera, or upload an existing image.'
              : isWeb
              ? 'Upload a clear receipt image from this computer, or use a connected camera.'
              : 'Take a clear photo of the full receipt. The app will upload it and start extraction.'}
          </Text>

          {message ? <Text style={styles.messageText}>{message}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {isWebCameraOpen ? (
            <WebCameraCapture
              isBusy={isBusy}
              onCancel={() => setIsWebCameraOpen(false)}
              onCapture={(asset) => {
                setIsWebCameraOpen(false);
                void processReceiptAsset(asset);
              }}
              onError={setErrorMessage}
            />
          ) : null}

          <View style={styles.actionStack}>
            {isWeb ? (
              prefersNativeWebCamera ? (
                <>
                  <Pressable
                    disabled={isBusy}
                    onPress={handleTakePhoto}
                    style={[styles.primaryButton, isBusy && styles.disabledButton]}>
                    <Text style={styles.primaryButtonText}>
                      {isBusy ? 'Working...' : step === 'complete' ? 'Take another photo' : 'Take receipt photo'}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={handleChoosePhoto}
                    style={[styles.secondaryActionButton, isBusy && styles.disabledButton]}>
                    <Text style={styles.secondaryActionButtonText}>Upload existing photo</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    disabled={isBusy}
                    onPress={handleChoosePhoto}
                    style={[styles.primaryButton, isBusy && styles.disabledButton]}>
                    <Text style={styles.primaryButtonText}>
                      {isBusy ? 'Working...' : step === 'complete' ? 'Upload another receipt' : 'Upload receipt'}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={handleTakePhoto}
                    style={[styles.secondaryActionButton, isBusy && styles.disabledButton]}>
                    <Text style={styles.secondaryActionButtonText}>Take photo</Text>
                  </Pressable>
                </>
              )
            ) : (
              <>
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
                  style={[styles.secondaryActionButton, isBusy && styles.disabledButton]}>
                  <Text style={styles.secondaryActionButtonText}>Upload existing photo</Text>
                </Pressable>
              </>
            )}
          </View>

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
  if (jobs.length === 0) {
    return 'Tools / Inventory';
  }

  if (jobs.length === 1) {
    return jobs[0].name;
  }

  return `${jobs.length} jobs selected`;
}

function isMobileWebBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const hasTouch =
    typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  const hasSmallViewport =
    typeof window !== 'undefined' &&
    Math.min(window.innerWidth, window.innerHeight) <= 820;

  return isMobileUserAgent || (hasTouch && hasSmallViewport);
}

function pickWebReceiptImage({ capture }: { capture: boolean }): Promise<ImagePicker.ImagePickerAsset | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    if (capture) {
      input.setAttribute('capture', 'environment');
    }

    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
    };

    input.onchange = async () => {
      const file = input.files?.[0] ?? null;

      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      try {
        const asset = await fileToImagePickerAsset(file);
        cleanup();
        resolve(asset);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function fileToImagePickerAsset(file: File): Promise<ImagePicker.ImagePickerAsset> {
  const dataUrl = await readFileAsDataUrl(file);
  const base64 = dataUrl.split(',')[1];

  if (!base64) {
    throw new Error('Unable to prepare receipt image.');
  }

  const dimensions = await readImageDimensions(dataUrl);

  return {
    base64,
    fileName: file.name || `receipt-${Date.now()}.jpg`,
    fileSize: file.size,
    height: dimensions.height,
    mimeType: file.type || 'image/jpeg',
    uri: dataUrl,
    width: dimensions.width,
  } as ImagePicker.ImagePickerAsset;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read receipt image.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read receipt image.'));
      }
    };
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(uri: string): Promise<{ height: number; width: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () => resolve({ height: 0, width: 0 });
    image.src = uri;
  });
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
  webContainer: {
    alignSelf: 'center',
    maxWidth: 720,
    width: '100%',
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
  actionStack: {
    gap: 10,
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
  secondaryActionButton: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryActionButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '800',
  },
});
