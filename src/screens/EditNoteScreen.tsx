import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import {
  fetchJobNote,
  fetchJobNoteAttachments,
  updateJobNote,
  uploadJobNotePhoto,
  type JobNoteAttachment,
} from '@/src/lib/jobNotes';
import type { Job } from '@/src/types/job';

type EditNoteScreenProps = {
  job: Job;
  noteId: string;
  onBack: () => void;
  onSaved: () => void;
};

export function EditNoteScreen({ job, noteId, onBack, onSaved }: EditNoteScreenProps) {
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<JobNoteAttachment[]>([]);
  const [newPhotos, setNewPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadNote = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [nextNote, nextAttachments] = await Promise.all([
          fetchJobNote(noteId),
          fetchJobNoteAttachments(noteId),
        ]);

        if (isMounted) {
          setNote(nextNote.note);
          setAttachments(nextAttachments);
          setNewPhotos([]);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load note.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadNote();

    return () => {
      isMounted = false;
    };
  }, [noteId]);

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!note.trim() && attachments.length === 0 && newPhotos.length === 0) {
      setErrorMessage('Add a note or at least one photo.');
      return;
    }

    setIsSaving(true);

    try {
      await updateJobNote(noteId, {
        note: note.trim() || 'Photo note',
      });

      for (const photo of newPhotos) {
        await uploadJobNotePhoto(job.id, noteId, photo);
      }

      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save note.');
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
      setNewPhotos((current) => [...current, result.assets[0]]);
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
      setNewPhotos((current) => [...current, ...result.assets]);
    }
  };

  const removeNewPhoto = (uri: string) => {
    setNewPhotos((current) => current.filter((photo) => photo.uri !== uri));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Back to job</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Edit note</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#335C43" />
                <Text style={styles.loadingText}>Loading note...</Text>
              </View>
            ) : null}

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
              {attachments.length > 0 || newPhotos.length > 0 ? (
                <View style={styles.photoGrid}>
                  {attachments.map((attachment) =>
                    attachment.signedUrl ? (
                      <Image
                        key={attachment.id}
                        source={{ uri: attachment.signedUrl }}
                        style={styles.photoPreview}
                      />
                    ) : null
                  )}
                  {newPhotos.map((photo) => (
                    <View key={photo.uri} style={styles.photoItem}>
                      <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                      <Pressable
                        style={styles.removePhotoButton}
                        onPress={() => removeNewPhoto(photo.uri)}>
                        <Text style={styles.removePhotoText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.photoHelp}>No photos attached yet.</Text>
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
              disabled={isSaving || isLoading}
              onPress={handleSubmit}
              style={[styles.saveButton, (isSaving || isLoading) && styles.disabledButton]}>
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
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
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
