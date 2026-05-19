import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createJobNote, uploadJobNotePhoto } from '@/src/lib/jobNotes';
import type { Job } from '@/src/types/job';

type AddNoteScreenProps = {
  backLabel?: string;
  job: Job;
  onBack: () => void;
  onCreated: () => void;
};

export function AddNoteScreen({
  backLabel = 'Back to updates',
  job,
  onBack,
  onCreated,
}: AddNoteScreenProps) {
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!note.trim() && photos.length === 0) {
      setErrorMessage('Add a note or at least one photo.');
      return;
    }

    setIsSaving(true);

    try {
      const createdNote = await createJobNote(job.id, {
        note: note.trim() || 'Photo note',
      });

      for (const photo of photos) {
        await uploadJobNotePhoto(job.id, createdNote.id, photo);
      }

      onCreated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add note.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTakePhoto = async () => {
    setErrorMessage(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Camera permission is required to take a note photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotos((current) => [...current, result.assets[0]]);
    }
  };

  const handleChoosePhotos = async () => {
    setErrorMessage(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Photo library permission is required to attach note photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotos((current) => [...current, ...result.assets]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Add note</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Note</Text>
              <TextInput
                multiline
                onChangeText={setNote}
                placeholder="Write a job note"
                placeholderTextColor="#8A94A6"
                style={styles.textArea}
                textAlignVertical="top"
                value={note}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Photos</Text>
              {photos.length > 0 ? (
                <View style={styles.photoGrid}>
                  {photos.map((photo) => (
                    <View key={photo.uri} style={styles.photoItem}>
                      <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                      <Pressable style={styles.removePhotoButton} onPress={() => removePhoto(photo.uri)}>
                        <Text style={styles.removePhotoText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.photoHelp}>Attach one or more job photos to this note.</Text>
              )}
              <View style={styles.photoActions}>
                <Pressable style={styles.secondaryButton} onPress={handleTakePhoto}>
                  <Text style={styles.secondaryButtonText}>Take photo</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={handleChoosePhotos}>
                  <Text style={styles.secondaryButtonText}>Choose photos</Text>
                </Pressable>
              </View>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving}
              onPress={handleSubmit}
              style={[styles.saveButton, isSaving && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save note'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  keyboardView: {
    flex: 1,
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
  form: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  textArea: {
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1F2933',
    fontSize: 16,
    minHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  photoHelp: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoItem: {
    gap: 6,
    width: 104,
  },
  photoPreview: {
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    height: 104,
    width: 104,
  },
  removePhotoButton: {
    alignItems: 'center',
    borderColor: '#B91C1C',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  removePhotoText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  secondaryButtonText: {
    color: '#335C43',
    fontSize: 14,
    fontWeight: '800',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
