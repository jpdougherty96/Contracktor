import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  attachReceiptPhoto,
  createUploadingReceipt,
  finalizeReceiptCapture,
  uploadReceiptPhoto,
} from '@/src/lib/receipts';
import { getUserFacingError } from '@/src/lib/userFacingError';
import type { Job } from '@/src/types/job';

type AddReceiptScreenProps = {
  autoStartCamera?: boolean;
  backLabel?: string;
  doneLabel?: string;
  includeInventoryDestination?: boolean;
  inventoryMode?: boolean;
  initialAsset?: ImagePicker.ImagePickerAsset | null;
  job?: Job | null;
  jobs?: Job[];
  onBack: () => void;
  onDone: () => void;
  onInitialAssetConsumed?: () => void;
  onReviewReceipt: (receiptId: string) => void;
};

type ReceiptStep = 'idle' | 'uploading' | 'complete';

const receiptImageMaxDimension = 4000;
const receiptJpegQuality = 0.95;

export function AddReceiptScreen({
  autoStartCamera = false,
  backLabel = 'Back to updates',
  doneLabel = 'Back to dashboard',
  includeInventoryDestination = false,
  inventoryMode = false,
  initialAsset = null,
  job,
  jobs,
  onBack,
  onDone,
  onInitialAssetConsumed,
  onReviewReceipt,
}: AddReceiptScreenProps) {
  const [step, setStep] = useState<ReceiptStep>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const didAutoStartCameraRef = useRef(false);
  const processedInitialAssetRef = useRef<ImagePicker.ImagePickerAsset | null>(null);
  const receiptJobs = jobs && jobs.length > 0 ? jobs : job ? [job] : [];

  const isBusy = step === 'uploading';
  const isWeb = Platform.OS === 'web';

  const processReceiptAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setStep('uploading');
      setMessage('Preparing receipt...');

      const contextJobId = inventoryMode ? null : job?.id;
      const receipt = await createUploadingReceipt(contextJobId ?? null);
      const preparedAsset = await prepareReceiptAssetForUpload(asset);
      setMessage('Uploading receipt...');
      const upload = await uploadReceiptPhoto(
        receipt.id,
        contextJobId ?? null,
        preparedAsset
      );
      await attachReceiptPhoto(receipt.id, upload.storagePath, upload.originalFilename);

      setMessage('Securing receipt...');
      await finalizeReceiptCapture(receipt.id);
      setStep('complete');
      setMessage('Receipt secured. Choose where it goes next.');
      onReviewReceipt(receipt.id);
      return;

    } catch (error) {
      setStep('idle');
      setErrorMessage(getUserFacingError(error, 'Unable to add receipt. Try again.'));
    }
  }, [
    inventoryMode,
    job?.id,
    onReviewReceipt,
  ]);

  const handleTakePhoto = useCallback(async () => {
    setMessage(null);
    setErrorMessage(null);

    if (isWeb) {
      const asset = await pickWebReceiptImage({ capture: 'environment' });

      if (asset) {
        await processReceiptAsset(asset);
      }

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
      quality: 1,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    await processReceiptAsset(result.assets[0]);
  }, [isWeb, processReceiptAsset]);

  const handleChoosePhoto = async () => {
    setMessage(null);
    setErrorMessage(null);

    if (isWeb) {
      const asset = await pickWebReceiptImage();

      if (asset) {
        await processReceiptAsset(asset);
      }

      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      base64: true,
      mediaTypes: ['images'],
      quality: 1,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    await processReceiptAsset(result.assets[0]);
  };

  useEffect(() => {
    if (isWeb || !autoStartCamera || didAutoStartCameraRef.current) {
      return;
    }

    didAutoStartCameraRef.current = true;
    void handleTakePhoto();
  }, [autoStartCamera, handleTakePhoto, isWeb]);

  useEffect(() => {
    if (!initialAsset || processedInitialAssetRef.current === initialAsset) {
      return;
    }

    processedInitialAssetRef.current = initialAsset;
    onInitialAssetConsumed?.();
    void processReceiptAsset(initialAsset);
  }, [initialAsset, onInitialAssetConsumed, processReceiptAsset]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, isWeb && styles.webContainer]}>
        <Pressable style={styles.backButton} onPress={onBack} disabled={isBusy}>
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Add receipt</Text>
          <Text style={styles.subtitle}>{formatReceiptContext(inventoryMode, receiptJobs)}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{isWeb ? 'Receipt file' : 'Receipt photo'}</Text>
          <Text style={styles.panelText}>
            {isWeb
              ? 'Take a clear photo of the full receipt. If the camera is unavailable, upload an existing image.'
              : 'Take a clear photo of the full receipt. The app will secure it for background processing.'}
          </Text>

          {message ? <Text style={styles.messageText}>{message}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.actionStack}>
              {isWeb ? (
                <>
                  <Pressable
                    disabled={isBusy}
                    onPress={handleTakePhoto}
                    style={[styles.primaryButton, isBusy && styles.disabledButton]}>
                    <Text style={styles.primaryButtonText}>
                      {isBusy
                        ? 'Working...'
                        : step === 'complete'
                          ? 'Take another photo'
                          : 'Take receipt photo'}
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
                    onPress={handleTakePhoto}
                    style={[styles.primaryButton, isBusy && styles.disabledButton]}>
                    <Text style={styles.primaryButtonText}>
                      {isBusy
                        ? 'Working...'
                        : step === 'complete'
                          ? 'Retake receipt photo'
                          : 'Take receipt photo'}
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

function formatReceiptContext(inventoryMode: boolean, jobs: Job[]): string {
  if (inventoryMode) {
    return 'Tools / Inventory';
  }

  if (jobs.length === 0) {
    return 'Choose destination after capture';
  }

  if (jobs.length === 1) {
    return jobs[0].name;
  }

  return `${jobs.length} jobs selected`;
}

export function pickWebReceiptImage(
  options: { capture?: 'environment' | 'user' } = {}
): Promise<ImagePicker.ImagePickerAsset | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    if (options.capture) {
      input.setAttribute('capture', options.capture);
    }

    input.style.display = 'none';

    let isSettled = false;

    const cleanup = () => {
      input.remove();
    };

    const settle = (asset: ImagePicker.ImagePickerAsset | null) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      resolve(asset);
    };

    input.addEventListener('cancel', () => settle(null), { once: true });

    input.onchange = async () => {
      const file = input.files?.[0] ?? null;

      if (!file) {
        settle(null);
        return;
      }

      try {
        const asset = await fileToImagePickerAsset(file);
        settle(asset);
      } catch (error) {
        isSettled = true;
        cleanup();
        reject(error);
      }
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function prepareReceiptAssetForUpload(
  asset: ImagePicker.ImagePickerAsset
): Promise<ImagePicker.ImagePickerAsset> {
  if (Platform.OS === 'web') {
    return asset;
  }

  if (!asset.uri) {
    return asset;
  }

  const largestDimension = Math.max(asset.width ?? 0, asset.height ?? 0);
  const actions =
    largestDimension > receiptImageMaxDimension
      ? [{ resize: getResizeDimensions(asset, receiptImageMaxDimension) }]
      : [];
  const manipulated = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    base64: true,
    compress: receiptJpegQuality,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    ...asset,
    base64: manipulated.base64 ?? asset.base64,
    fileName: `${(asset.fileName ?? `receipt-${Date.now()}`).replace(/\.[^.]+$/, '')}.jpg`,
    height: manipulated.height,
    mimeType: 'image/jpeg',
    uri: manipulated.uri,
    width: manipulated.width,
  };
}

function getResizeDimensions(
  asset: ImagePicker.ImagePickerAsset,
  maxDimension: number
): { height?: number; width?: number } {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;

  if (width >= height) {
    return { width: maxDimension };
  }

  return { height: maxDimension };
}

async function fileToImagePickerAsset(file: File): Promise<ImagePicker.ImagePickerAsset> {
  const dataUrl = await readFileAsDataUrl(file);
  const preparedImage = await prepareWebReceiptImage(dataUrl);
  const base64 = preparedImage.dataUrl.split(',')[1];

  if (!base64) {
    throw new Error('Unable to prepare receipt image.');
  }

  const originalBaseName = (file.name || `receipt-${Date.now()}`).replace(/\.[^.]+$/, '');
  const extension = preparedImage.mimeType.includes('png')
    ? 'png'
    : preparedImage.mimeType.includes('webp')
      ? 'webp'
      : preparedImage.mimeType.includes('heic') || preparedImage.mimeType.includes('heif')
        ? 'heic'
        : 'jpg';

  return {
    base64,
    fileName: `${originalBaseName}.${extension}`,
    fileSize: preparedImage.size ?? file.size,
    height: preparedImage.height,
    mimeType: preparedImage.mimeType,
    uri: preparedImage.dataUrl,
    width: preparedImage.width,
  } as ImagePicker.ImagePickerAsset;
}

async function prepareWebReceiptImage(dataUrl: string): Promise<{
  dataUrl: string;
  height: number;
  mimeType: string;
  size: number | null;
  width: number;
}> {
  const dimensions = await readImageDimensions(dataUrl);
  const originalMimeType = getDataUrlMimeType(dataUrl) ?? 'image/jpeg';
  const originalImage = {
    dataUrl,
    height: dimensions.height,
    mimeType: originalMimeType,
    size: null,
    width: dimensions.width,
  };

  if (
    typeof document === 'undefined' ||
    !dimensions.height ||
    !dimensions.width
  ) {
    return originalImage;
  }

  const scale = Math.min(1, receiptImageMaxDimension / Math.max(dimensions.height, dimensions.width));
  const width = Math.round(dimensions.width * scale);
  const height = Math.round(dimensions.height * scale);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return originalImage;
  }

  const image = await loadImage(dataUrl);
  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const jpegDataUrl = canvas.toDataURL('image/jpeg', receiptJpegQuality);

  return {
    dataUrl: jpegDataUrl,
    height,
    mimeType: 'image/jpeg',
    size: estimateDataUrlBytes(jpegDataUrl),
    width,
  };
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

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to prepare receipt image.'));
    image.src = uri;
  });
}

function estimateDataUrlBytes(dataUrl: string): number | null {
  const base64 = dataUrl.split(',')[1];

  if (!base64) {
    return null;
  }

  return Math.round((base64.length * 3) / 4);
}

function getDataUrlMimeType(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);base64,/);

  return match?.[1] ?? null;
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
    maxWidth: 980,
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
