import { Feather } from '@expo/vector-icons';
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

import { uploadJobNotePhoto } from '@/src/lib/jobNotes';
import {
  commitTellContracktorEntry,
  submitTellContracktorText,
  type TellContracktorCandidateJob,
  type TellContracktorCommitProposal,
  type TellContracktorPhotoInput,
  type TellContracktorResult,
} from '@/src/lib/tellContracktor';
import { colors } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type TellContracktorScreenProps = {
  contextJob?: Job | null;
  onBack: () => void;
  onDone: () => void;
};

type Proposal =
  | {
      id: string;
      jobId: string | null;
      note: string;
      type: 'note';
    }
  | {
      description: string;
      id: string;
      jobId: string | null;
      normalizedName: string | null;
      quantity: string;
      type: 'shopping';
      unit: string;
    }
  | {
      date: string;
      hours: string;
      id: string;
      jobId: string | null;
      note: string;
      type: 'hours';
      workerName: string;
    };

type ShoppingProposal = Extract<Proposal, { type: 'shopping' }>;

type ShoppingProposalGroupData = {
  jobName: string;
  key: string;
  proposals: ShoppingProposal[];
};

export function TellContracktorScreen({
  contextJob = null,
  onBack,
  onDone,
}: TellContracktorScreenProps) {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(contextJob?.id ?? null);
  const [result, setResult] = useState<TellContracktorResult | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const handleSubmit = async () => {
    const cleanText = text.trim();

    setErrorMessage(null);
    setResult(null);
    setProposals([]);
    setIsApproved(false);

    if (!cleanText && photos.length === 0) {
      setErrorMessage('Tell conTRACKtor what happened, or attach a photo with context.');
      return;
    }

    const photoInputs: TellContracktorPhotoInput[] = [];

    for (const photo of photos) {
      if (!photo.base64) {
        continue;
      }

      photoInputs.push({
        base64: photo.base64,
        mimeType: photo.mimeType,
      });
    }

    if (photoInputs.length !== photos.length) {
      setErrorMessage('One photo could not be read. Remove it and try again.');
      return;
    }

    setIsSaving(true);

    try {
      const nextResult = await submitTellContracktorText({
        jobId: selectedJobId,
        photos: photoInputs,
        text: cleanText,
      });

      const nextProposals = buildProposals(nextResult, selectedJobId);

      setResult(nextResult);
      setProposals(nextProposals);

      if (nextResult.needs_job) {
        setErrorMessage('Choose the job this belongs to.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to process this update.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAll = async () => {
    if (!result) {
      return;
    }

    if (proposals.length === 0) {
      setErrorMessage('There is nothing to approve.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const commitProposals = buildCommitProposals(proposals, selectedJobId, result);
      const commitResult = await commitTellContracktorEntry(result.entry_id, commitProposals);

      if (photos.length > 0 && commitResult.created_note_id) {
        const noteRecord = commitResult.records.find(
          (record) => record.record_id === commitResult.created_note_id
        );

        if (noteRecord) {
          for (const [photoIndex, photo] of photos.entries()) {
            await uploadJobNotePhoto(noteRecord.job_id, commitResult.created_note_id, photo, {
              idempotencyKey: `${result.entry_id}-${photoIndex + 1}`,
            });
          }
        }
      }

      setIsApproved(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to approve these entries.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTakePhoto = async () => {
    setErrorMessage(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Camera permission is required to attach a photo.');
      return;
    }

    const photoResult = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.8,
    });

    if (!photoResult.canceled && photoResult.assets[0]) {
      setPhotos((current) => [...current, photoResult.assets[0]]);
    }
  };

  const handleChoosePhotos = async () => {
    setErrorMessage(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage('Photo library permission is required to attach photos.');
      return;
    }

    const photoResult = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.8,
    });

    if (!photoResult.canceled) {
      setPhotos((current) => [...current, ...photoResult.assets]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  };

  const needsJob = Boolean(result?.needs_job);
  const hasProposals = Boolean(result && proposals.length > 0);
  const shoppingProposalGroups = result
    ? getShoppingProposalGroups(proposals, selectedJobId, result)
    : [];
  const nonShoppingProposals = proposals.filter((proposal) => proposal.type !== 'shopping');

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>{contextJob ? 'Back to job' : 'Back home'}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Tell conTRACKtor</Text>
            <Text style={styles.subtitle}>Type or dictate what happened. conTRACKtor will handle the records.</Text>
          </View>

          {isApproved ? (
            <View style={styles.savedPanel}>
              <Feather color={colors.primaryGreen} name="check-circle" size={24} />
              <View style={styles.savedText}>
                <Text style={styles.savedTitle}>Saved</Text>
                <Text style={styles.savedDetail}>Approved entries were added to conTRACKtor.</Text>
              </View>
            </View>
          ) : null}

          {!hasProposals && !isApproved ? (
            <View style={styles.form}>
              <TextInput
                multiline
                onChangeText={setText}
                placeholder="What happened?"
                placeholderTextColor={colors.mutedText}
                style={styles.textArea}
                textAlignVertical="top"
                value={text}
              />
              <Text style={styles.exampleText}>
                Example: Rotten framing on Johnson. Need 10 more 10-foot 2x4s. Or attach photos of a handwritten list.
              </Text>

              {needsJob && result?.candidates ? (
                <View style={styles.jobChoice}>
                  <Text style={styles.jobChoiceTitle}>Which job?</Text>
                  <View style={styles.jobChipWrap}>
                    {result.candidates.map((job) => (
                      <JobChip
                        isSelected={selectedJobId === job.id}
                        job={job}
                        key={job.id}
                        onPress={() => {
                          setSelectedJobId(job.id);
                          setErrorMessage(null);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.photoSection}>
                <View style={styles.photoHeader}>
                  <Text style={styles.photoTitle}>Photos</Text>
                  <Text style={styles.photoHint}>Optional</Text>
                </View>
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
                ) : null}
                <View style={styles.photoActions}>
                  <Pressable style={styles.secondaryButton} onPress={handleTakePhoto}>
                    <Feather color={colors.primaryGreen} name="camera" size={18} />
                    <Text style={styles.secondaryButtonText}>Take photo</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={handleChoosePhotos}>
                    <Feather color={colors.primaryGreen} name="image" size={18} />
                    <Text style={styles.secondaryButtonText}>Choose</Text>
                  </Pressable>
                </View>
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                disabled={isSaving}
                onPress={handleSubmit}
                style={[styles.sendButton, isSaving ? styles.disabledButton : null]}>
                <Text style={styles.sendButtonText}>
                  {isSaving ? 'Reading...' : 'Send'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {hasProposals && !isApproved ? (
            <View style={styles.proposalStack}>
              <View style={styles.proposalHeader}>
                <Text style={styles.proposalTitle}>Here is what I got</Text>
                <Text style={styles.proposalHelp}>Review, edit, remove, then approve.</Text>
              </View>

              {needsJob && result?.candidates ? (
                <View style={styles.jobChoice}>
                  <Text style={styles.jobChoiceTitle}>Which job?</Text>
                  <View style={styles.jobChipWrap}>
                    {result.candidates.map((job) => (
                      <JobChip
                        isSelected={selectedJobId === job.id}
                        job={job}
                        key={job.id}
                        onPress={() => {
                          setSelectedJobId(job.id);
                          setErrorMessage(null);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {shoppingProposalGroups.map((group) => (
                <ShoppingProposalGroup
                  group={group}
                  key={group.key}
                  onChange={(nextProposal) =>
                    setProposals((current) =>
                      current.map((candidate) =>
                        candidate.id === nextProposal.id ? nextProposal : candidate
                      )
                    )
                  }
                  onRemove={(proposalId) =>
                    setProposals((current) =>
                      current.filter((candidate) => candidate.id !== proposalId)
                    )
                  }
                />
              ))}

              {nonShoppingProposals.map((proposal) => (
                <ProposalCard
                  jobName={getProposalJobName(proposal, selectedJobId, result)}
                  key={proposal.id}
                  onChange={(nextProposal) =>
                    setProposals((current) =>
                      current.map((candidate) =>
                        candidate.id === proposal.id ? nextProposal : candidate
                      )
                    )
                  }
                  onRemove={() =>
                    setProposals((current) =>
                      current.filter((candidate) => candidate.id !== proposal.id)
                    )
                  }
                  proposal={proposal}
                />
              ))}

              {result?.parsed.scope_or_budget_impact ? (
                <View style={styles.scopePanel}>
                  <Feather color="#B45309" name="alert-circle" size={20} />
                  <Text style={styles.scopeText}>Possible scope or budget impact mentioned.</Text>
                </View>
              ) : null}

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                disabled={isSaving}
                onPress={handleApproveAll}
                style={[styles.sendButton, isSaving ? styles.disabledButton : null]}>
                <Text style={styles.sendButtonText}>
                  {isSaving ? 'Saving...' : 'Approve all'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isApproved ? (
            <Pressable style={styles.sendButton} onPress={onDone}>
              <Text style={styles.sendButtonText}>Done</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProposalCard({
  jobName,
  onChange,
  onRemove,
  proposal,
}: {
  jobName: string;
  onChange: (proposal: Proposal) => void;
  onRemove: () => void;
  proposal: Proposal;
}) {
  return (
    <View style={styles.proposalCard}>
      <View style={styles.proposalCardHeader}>
        <View>
          <Text style={styles.proposalKind}>{formatProposalKind(proposal.type)}</Text>
          <Text style={styles.proposalJob}>{jobName}</Text>
        </View>
        <Pressable onPress={onRemove} style={styles.removeProposalButton}>
          <Feather color={colors.danger} name="x" size={18} />
        </Pressable>
      </View>

      {proposal.type === 'note' ? (
        <TextInput
          multiline
          onChangeText={(note) => onChange({ ...proposal, note })}
          style={[styles.proposalInput, styles.proposalTextArea]}
          textAlignVertical="top"
          value={proposal.note}
        />
      ) : null}

      {proposal.type === 'shopping' ? (
        <ShoppingProposalRow onChange={onChange} onRemove={onRemove} proposal={proposal} />
      ) : null}

      {proposal.type === 'hours' ? (
        <View style={styles.proposalFields}>
          <View style={styles.twoColumnFields}>
            <FieldRow
              inputMode="decimal"
              label="Hours"
              onChangeText={(hours) => onChange({ ...proposal, hours })}
              value={proposal.hours}
            />
            <FieldRow
              label="Date"
              onChangeText={(date) => onChange({ ...proposal, date })}
              value={proposal.date}
            />
          </View>
          <FieldRow
            label="Worker"
            onChangeText={(workerName) => onChange({ ...proposal, workerName })}
            value={proposal.workerName}
          />
          <FieldRow
            label="Note"
            onChangeText={(note) => onChange({ ...proposal, note })}
            value={proposal.note}
          />
        </View>
      ) : null}

    </View>
  );
}

function ShoppingProposalGroup({
  group,
  onChange,
  onRemove,
}: {
  group: ShoppingProposalGroupData;
  onChange: (proposal: ShoppingProposal) => void;
  onRemove: (proposalId: string) => void;
}) {
  return (
    <View style={styles.shoppingGroupCard}>
      <View style={styles.shoppingGroupHeader}>
        <View>
          <Text style={styles.proposalKind}>Shopping list</Text>
          <Text style={styles.proposalJob}>{group.jobName}</Text>
        </View>
        <Text style={styles.shoppingGroupCount}>
          {group.proposals.length} {group.proposals.length === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <View style={styles.shoppingRows}>
        {group.proposals.map((proposal) => (
          <ShoppingProposalRow
            key={proposal.id}
            onChange={onChange}
            onRemove={() => onRemove(proposal.id)}
            proposal={proposal}
          />
        ))}
      </View>
    </View>
  );
}

function ShoppingProposalRow({
  onChange,
  onRemove,
  proposal,
}: {
  onChange: (proposal: ShoppingProposal) => void;
  onRemove: () => void;
  proposal: ShoppingProposal;
}) {
  return (
    <View style={styles.shoppingProposalRow}>
      <View style={styles.shoppingItemLine}>
        <TextInput
          onChangeText={(description) => onChange({ ...proposal, description })}
          placeholder="Item"
          placeholderTextColor={colors.mutedText}
          style={styles.shoppingItemInput}
          value={proposal.description}
        />
        <Pressable onPress={onRemove} style={styles.shoppingRemoveButton}>
          <Feather color={colors.danger} name="x" size={18} />
        </Pressable>
      </View>
      <View style={styles.shoppingMetaLine}>
        <TextInput
          inputMode="decimal"
          onChangeText={(quantity) => onChange({ ...proposal, quantity })}
          placeholder="Qty"
          placeholderTextColor="#DDE7DE"
          style={[
            styles.shoppingQtyInput,
            proposal.quantity.trim() ? null : styles.shoppingQtyInputEmpty,
          ]}
          value={proposal.quantity}
        />
        <TextInput
          onChangeText={(unit) => onChange({ ...proposal, unit })}
          placeholder="unit"
          placeholderTextColor={colors.mutedText}
          style={styles.shoppingUnitInput}
          value={proposal.unit}
        />
      </View>
    </View>
  );
}

function FieldRow({
  inputMode,
  label,
  onChangeText,
  value,
}: {
  inputMode?: 'decimal';
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.proposalField}>
      <Text style={styles.proposalLabel}>{label}</Text>
      <TextInput
        inputMode={inputMode}
        onChangeText={onChangeText}
        style={styles.proposalInput}
        value={value}
      />
    </View>
  );
}

function JobChip({
  isSelected,
  job,
  onPress,
}: {
  isSelected: boolean;
  job: TellContracktorCandidateJob;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.jobChip, isSelected ? styles.jobChipSelected : null]}>
      <Text style={[styles.jobChipText, isSelected ? styles.jobChipTextSelected : null]}>
        {job.name}
      </Text>
    </Pressable>
  );
}

function buildProposals(result: TellContracktorResult, fallbackJobId: string | null): Proposal[] {
  const proposals: Proposal[] = [];
  const defaultJobId = result.job?.id ?? fallbackJobId ?? result.parsed.matched_job_id;

  if (result.parsed.cleaned_note.trim()) {
    proposals.push({
      id: createLocalId('note'),
      jobId: defaultJobId,
      note: result.parsed.cleaned_note.trim(),
      type: 'note',
    });
  }

  for (const need of result.parsed.shopping_needs) {
    proposals.push({
      description: need.description,
      id: createLocalId('shopping'),
      jobId: need.job_id ?? defaultJobId,
      normalizedName: need.normalized_name,
      quantity: need.quantity === null ? '' : String(need.quantity),
      type: 'shopping',
      unit: need.unit ?? '',
    });
  }

  for (const hours of result.parsed.hours) {
    proposals.push({
      date: hours.date ?? getTodayDate(),
      hours: hours.hours === null ? '' : String(hours.hours),
      id: createLocalId('hours'),
      jobId: hours.job_id ?? defaultJobId,
      note: hours.note ?? '',
      type: 'hours',
      workerName: hours.worker_name ?? '',
    });
  }

  return proposals;
}

function buildCommitProposals(
  proposals: Proposal[],
  selectedJobId: string | null,
  result: TellContracktorResult
): TellContracktorCommitProposal[] {
  const commitProposals: TellContracktorCommitProposal[] = [];

  for (const proposal of proposals) {
    const jobId = getProposalJobId(proposal, selectedJobId, result);

    if (!jobId) {
      throw new Error('Choose a job before approving these entries.');
    }

    if (proposal.type === 'note') {
      const note = proposal.note.trim();

      if (note) {
        commitProposals.push({ id: proposal.id, job_id: jobId, note, type: 'note' });
      }

      continue;
    }

    if (proposal.type === 'shopping') {
      const description = proposal.description.trim();

      if (description) {
        commitProposals.push({
          description,
          id: proposal.id,
          job_id: jobId,
          normalized_name: proposal.normalizedName,
          quantity: parseOptionalNumber(proposal.quantity),
          type: 'shopping',
          unit: proposal.unit.trim() || null,
        });
      }

      continue;
    }

    const hours = parseRequiredNumber(proposal.hours);

    if (hours === null || hours <= 0 || hours > 24) {
      throw new Error('Hours entries need a number greater than 0 and no more than 24.');
    }

    commitProposals.push({
      date: proposal.date || getTodayDate(),
      hours,
      id: proposal.id,
      job_id: jobId,
      note: proposal.note.trim() || null,
      type: 'hours',
      worker_name: proposal.workerName.trim() || null,
    });
  }

  if (commitProposals.length === 0) {
    throw new Error('There is nothing to approve.');
  }

  return commitProposals;
}

function getShoppingProposalGroups(
  proposals: Proposal[],
  selectedJobId: string | null,
  result: TellContracktorResult
): ShoppingProposalGroupData[] {
  const groups = new Map<string, ShoppingProposalGroupData>();

  for (const proposal of proposals) {
    if (proposal.type !== 'shopping') {
      continue;
    }

    const jobId = proposal.jobId ?? selectedJobId ?? result.job?.id ?? result.parsed.matched_job_id;
    const key = jobId ?? 'job-needed';
    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.proposals.push(proposal);
      continue;
    }

    groups.set(key, {
      jobName: getProposalJobName(proposal, selectedJobId, result),
      key,
      proposals: [proposal],
    });
  }

  return Array.from(groups.values());
}

function getProposalJobId(
  proposal: Proposal,
  selectedJobId: string | null,
  result: TellContracktorResult
): string | null {
  return proposal.jobId ?? selectedJobId ?? result.job?.id ?? result.parsed.matched_job_id;
}

function getProposalJobName(
  proposal: Proposal,
  selectedJobId: string | null,
  result: TellContracktorResult | null
): string {
  const jobId = proposal.jobId ?? selectedJobId ?? result?.job?.id ?? result?.parsed.matched_job_id;
  const candidates = [
    ...(result?.job ? [result.job] : []),
    ...(result?.candidates ?? []),
  ];
  const job = candidates.find((candidate) => candidate.id === jobId);

  return job?.name ?? 'Job needed';
}

function formatProposalKind(type: Proposal['type']): string {
  if (type === 'hours') {
    return 'Hours';
  }

  if (type === 'shopping') {
    return 'Shopping';
  }

  return 'Job note';
}

function parseRequiredNumber(value: string): number | null {
  const parsed = Number(value.replace(/[$,]/g, '').trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.replace(/[$,]/g, '').trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  backLink: {
    color: colors.primaryGreen,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 26,
  },
  header: {
    marginBottom: 22,
  },
  title: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 46,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 6,
  },
  form: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  textArea: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.standardBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    minHeight: 190,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  exampleText: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  jobChoice: {
    gap: 10,
  },
  jobChoiceTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  jobChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  jobChip: {
    borderColor: colors.standardBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  jobChipSelected: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  jobChipText: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '900',
  },
  jobChipTextSelected: {
    color: colors.warmWhite,
  },
  photoSection: {
    gap: 10,
  },
  photoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  photoHint: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '800',
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
    backgroundColor: colors.appBackground,
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    height: 104,
    width: 104,
  },
  removePhotoButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  removePhotoText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.primaryGreen,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: colors.primaryGreen,
    fontSize: 15,
    fontWeight: '900',
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: colors.warmWhite,
    fontSize: 18,
    fontWeight: '900',
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  savedPanel: {
    alignItems: 'flex-start',
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  savedText: {
    flex: 1,
    gap: 5,
  },
  savedTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  savedDetail: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  proposalStack: {
    gap: 14,
  },
  proposalHeader: {
    gap: 4,
  },
  proposalTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  proposalHelp: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  shoppingGroupCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shoppingGroupHeader: {
    alignItems: 'flex-start',
    borderBottomColor: colors.standardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  shoppingGroupCount: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  shoppingRows: {
    backgroundColor: colors.warmWhite,
  },
  shoppingProposalRow: {
    borderBottomColor: colors.standardBorder,
    borderBottomWidth: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  shoppingItemLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  shoppingItemInput: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    minHeight: 42,
    padding: 0,
  },
  shoppingRemoveButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 9,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  shoppingMetaLine: {
    flexDirection: 'row',
    gap: 8,
  },
  shoppingQtyInput: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '900',
    minHeight: 38,
    paddingHorizontal: 12,
    textAlign: 'center',
    width: 86,
  },
  shoppingQtyInputEmpty: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    color: colors.text,
  },
  shoppingUnitInput: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  proposalCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  proposalCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  proposalKind: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  proposalJob: {
    color: colors.primaryGreen,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  removeProposalButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 9,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  proposalFields: {
    gap: 10,
  },
  proposalField: {
    flex: 1,
    gap: 6,
  },
  proposalLabel: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  proposalInput: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  proposalTextArea: {
    lineHeight: 22,
    minHeight: 110,
  },
  twoColumnFields: {
    flexDirection: 'row',
    gap: 10,
  },
  scopePanel: {
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  scopeText: {
    color: '#92400E',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
});
