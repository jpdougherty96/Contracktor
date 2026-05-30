import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export type CrewFormMember = {
  hourlyRate: string;
  key: string;
  name: string;
};

type JobCrewEditorProps = {
  members: CrewFormMember[];
  onChangeMembers: (members: CrewFormMember[]) => void;
};

export function JobCrewEditor({ members, onChangeMembers }: JobCrewEditorProps) {
  const updateMember = (key: string, update: Partial<CrewFormMember>) => {
    onChangeMembers(
      members.map((member) => (member.key === key ? { ...member, ...update } : member))
    );
  };

  const removeMember = (key: string) => {
    onChangeMembers(members.filter((member) => member.key !== key));
  };

  const addMember = () => {
    onChangeMembers([
      ...members,
      {
        hourlyRate: '',
        key: createCrewKey(),
        name: '',
      },
    ]);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Job crew</Text>
          <Text style={styles.sectionDescription}>
            Add the people who may log hours on this job. Rates can be changed on each time entry.
          </Text>
        </View>
      </View>

      {members.map((member, index) => (
        <View key={member.key} style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <Text style={styles.memberTitle}>Crew member {index + 1}</Text>
            {members.length > 1 ? (
              <Pressable onPress={() => removeMember(member.key)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <Field
            label="Name"
            onChangeText={(value) => updateMember(member.key, { name: value })}
            placeholder="Worker name"
            value={member.name}
          />
          <Field
            inputMode="decimal"
            label="Hourly rate"
            onChangeText={(value) => updateMember(member.key, { hourlyRate: value })}
            placeholder="Optional"
            value={member.hourlyRate}
          />
        </View>
      ))}

      <Pressable onPress={addMember} style={styles.addButton}>
        <Text style={styles.addButtonText}>Add crew member</Text>
      </Pressable>
    </View>
  );
}

export function createCrewKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  inputMode,
}: {
  inputMode?: 'decimal';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        inputMode={inputMode}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A94A6"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionDescription: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  memberCard: {
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  memberHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memberTitle: {
    color: '#1F2933',
    fontSize: 14,
    fontWeight: '900',
  },
  removeButton: {
    minHeight: 32,
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '900',
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1F2933',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  addButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  addButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '900',
  },
});
