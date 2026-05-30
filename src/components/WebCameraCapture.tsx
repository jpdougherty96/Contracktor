import type { ImagePickerAsset } from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type WebCameraCaptureProps = {
  isBusy?: boolean;
  onCancel: () => void;
  onCapture: (asset: ImagePickerAsset) => void;
  onError: (message: string) => void;
};

export function WebCameraCapture({
  isBusy = false,
  onCancel,
  onCapture,
  onError,
}: WebCameraCaptureProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError('Camera capture is not available in this browser. Upload a receipt image instead.');
        setIsStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
          },
        });

        if (!isMounted) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Unable to start camera.');
      } finally {
        if (isMounted) {
          setIsStarting(false);
        }
      }
    };

    void startCamera();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        stopStream(streamRef.current);
      }
    };
  }, [onError]);

  const handleCapture = () => {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      onError('Camera preview is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      onError('Unable to capture camera image.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const base64 = dataUrl.split(',')[1];

    if (!base64) {
      onError('Unable to prepare camera image.');
      return;
    }

    onCapture({
      base64,
      fileName: `receipt-${Date.now()}.jpg`,
      height: canvas.height,
      mimeType: 'image/jpeg',
      uri: dataUrl,
      width: canvas.width,
    } as ImagePickerAsset);
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Camera</Text>
      <View style={styles.previewFrame}>
        {React.createElement('video', {
          muted: true,
          playsInline: true,
          ref: videoRef,
          style: styles.video,
        })}
        {isStarting ? <Text style={styles.previewMessage}>Starting camera...</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={isBusy || isStarting}
          onPress={handleCapture}
          style={[styles.captureButton, (isBusy || isStarting) && styles.disabledButton]}>
          <Text style={styles.captureButtonText}>Take photo</Text>
        </Pressable>
        <Pressable disabled={isBusy} onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

const styles = StyleSheet.create({
  panel: {
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  title: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '900',
  },
  previewFrame: {
    backgroundColor: '#111827',
    borderRadius: 8,
    height: 300,
    maxHeight: 300,
    overflow: 'hidden',
    position: 'relative',
  },
  previewMessage: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    left: 16,
    position: 'absolute',
    top: 16,
  },
  video: {
    height: '100%',
    objectFit: 'contain',
    width: '100%',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 2,
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
