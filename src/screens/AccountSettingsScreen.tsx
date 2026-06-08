import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  fetchAccountProfile,
  updateAccountProfile,
  type AccountProfile,
} from '@/src/lib/profiles';
import { colors } from '@/src/styles/theme';

type AccountSettingsScreenProps = {
  onBack: () => void;
  onChangePassword: () => void;
  onSaved: () => void;
};

export function AccountSettingsScreen({ onBack, onChangePassword, onSaved }: AccountSettingsScreenProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [defaultInvoiceTerms, setDefaultInvoiceTerms] = useState('');
  const [defaultInvoiceNote, setDefaultInvoiceNote] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [defaultHourlyRate, setDefaultHourlyRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const applyProfileToForm = (nextProfile: AccountProfile) => {
    setFullName(nextProfile.fullName ?? '');
    setCompanyName(nextProfile.companyName ?? '');
    setPhone(formatPhoneNumber(nextProfile.phone ?? ''));
    setWebsite(nextProfile.website ?? '');
    setAddressLine1(nextProfile.addressLine1 ?? '');
    setAddressLine2(nextProfile.addressLine2 ?? '');
    setCity(nextProfile.city ?? '');
    setState(nextProfile.state ?? '');
    setPostalCode(nextProfile.postalCode ?? '');
    setDefaultInvoiceTerms(nextProfile.defaultInvoiceTerms ?? '');
    setDefaultInvoiceNote(nextProfile.defaultInvoiceNote ?? '');
    setInvoiceEmail(nextProfile.invoiceEmail ?? nextProfile.email ?? '');
    setDefaultHourlyRate(
      nextProfile.defaultHourlyRate !== null ? String(nextProfile.defaultHourlyRate) : ''
    );
  };

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextProfile = await fetchAccountProfile();

        if (isMounted) {
          setProfile(nextProfile);
          applyProfileToForm(nextProfile);
        }
      } catch (profileError) {
        if (isMounted) {
          setError(profileError instanceof Error ? profileError.message : 'Unable to load account settings.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    setError(null);
    setMessage(null);

    const parsedRate = parseOptionalCurrency(defaultHourlyRate);

    if (parsedRate === undefined) {
      setError('Enter a valid default hourly rate.');
      return;
    }

    setIsSaving(true);

    try {
      const nextProfile = await updateAccountProfile({
        addressLine1,
        addressLine2,
        city,
        companyName,
        defaultHourlyRate: parsedRate,
        defaultInvoiceNote,
        defaultInvoiceTerms,
        fullName,
        invoiceEmail,
        phone: formatPhoneNumber(phone),
        postalCode,
        state,
        website,
      });

      setProfile(nextProfile);
      applyProfileToForm(nextProfile);
      setMessage('Account settings saved.');
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save account settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Pressable onPress={onBack}>
              <Text style={styles.backLink}>Back home</Text>
            </Pressable>

            <View style={styles.header}>
              <Text style={styles.title}>Account settings</Text>
              <Text style={styles.subtitle}>Update the details conTRACKtor uses around the app.</Text>
            </View>

            <View style={styles.card}>
              {isLoading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={colors.primaryGreen} />
                  <Text style={styles.loadingText}>Loading account settings...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Account email</Text>
                    <View style={styles.readOnlyField}>
                      <Text style={styles.readOnlyText}>{profile?.email ?? 'No email found'}</Text>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Full name</Text>
                    <TextInput
                      autoCapitalize="words"
                      autoComplete="name"
                      onChangeText={setFullName}
                      placeholder="John Dougherty"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={fullName}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Company name</Text>
                    <TextInput
                      autoCapitalize="words"
                      onChangeText={setCompanyName}
                      placeholder="Dougherty Construction"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={companyName}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Default hourly rate</Text>
                    <TextInput
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      onChangeText={setDefaultHourlyRate}
                      placeholder="75.00"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={defaultHourlyRate}
                    />
                  </View>

                  <View style={styles.sectionDivider} />

                  <View>
                    <Text style={styles.sectionTitle}>Invoice business profile</Text>
                    <Text style={styles.sectionDetail}>
                      These details appear on customer invoices and are required before saving or printing.
                    </Text>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Invoice email</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="email"
                      inputMode="email"
                      keyboardType="email-address"
                      onChangeText={setInvoiceEmail}
                      placeholder={profile?.email ?? 'you@example.com'}
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={invoiceEmail}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Phone</Text>
                    <TextInput
                      keyboardType="phone-pad"
                      onChangeText={(value) => setPhone(formatPhoneNumber(value))}
                      placeholder="(555) 123-4567"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={phone}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Address line 1</Text>
                    <TextInput
                      autoCapitalize="words"
                      onChangeText={setAddressLine1}
                      placeholder="123 Main St"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={addressLine1}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Address line 2</Text>
                    <TextInput
                      autoCapitalize="words"
                      onChangeText={setAddressLine2}
                      placeholder="Suite, unit, etc. (optional)"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={addressLine2}
                    />
                  </View>

                  <View style={styles.inlineFieldRow}>
                    <View style={styles.inlineFieldGrow}>
                      <Text style={styles.label}>City</Text>
                      <TextInput
                        autoCapitalize="words"
                        onChangeText={setCity}
                        placeholder="Porter"
                        placeholderTextColor="#8A94A6"
                        style={styles.input}
                        value={city}
                      />
                    </View>
                    <View style={styles.inlineFieldSmall}>
                      <Text style={styles.label}>State</Text>
                      <TextInput
                        autoCapitalize="characters"
                        onChangeText={setState}
                        placeholder="MN"
                        placeholderTextColor="#8A94A6"
                        style={styles.input}
                        value={state}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>ZIP / postal code</Text>
                    <TextInput
                      keyboardType="numbers-and-punctuation"
                      onChangeText={setPostalCode}
                      placeholder="56280"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={postalCode}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Website</Text>
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="url"
                      onChangeText={setWebsite}
                      placeholder="https://example.com"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={website}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Default payment terms</Text>
                    <TextInput
                      onChangeText={setDefaultInvoiceTerms}
                      placeholder="Due on receipt"
                      placeholderTextColor="#8A94A6"
                      style={styles.input}
                      value={defaultInvoiceTerms}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Default invoice note</Text>
                    <TextInput
                      multiline
                      onChangeText={setDefaultInvoiceNote}
                      placeholder="Thank you for your business."
                      placeholderTextColor="#8A94A6"
                      style={[styles.input, styles.multilineInput]}
                      textAlignVertical="top"
                      value={defaultInvoiceNote}
                    />
                  </View>

                  <View style={styles.securitySection}>
                    <View>
                      <Text style={styles.sectionTitle}>Password</Text>
                      <Text style={styles.sectionDetail}>Update the password used to log in.</Text>
                    </View>
                    <Pressable onPress={onChangePassword} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Change password</Text>
                    </Pressable>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  {message ? <Text style={styles.messageText}>{message}</Text> : null}

                  <Pressable
                    disabled={isSaving}
                    onPress={handleSave}
                    style={[styles.saveButton, isSaving && styles.disabledButton]}>
                    {isSaving ? (
                      <ActivityIndicator color={colors.warmWhite} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save changes</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function parseOptionalCurrency(value: string): number | null | undefined {
  const cleaned = value.replace(/[$,\s]/g, '');

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed * 100) / 100;
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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
    flexGrow: 1,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 980,
    paddingHorizontal: 4,
    paddingTop: 12,
    width: '100%',
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
  card: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  inlineFieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineFieldGrow: {
    flex: 1,
    gap: 6,
  },
  inlineFieldSmall: {
    gap: 6,
    width: 104,
  },
  label: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '900',
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.strongBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 14,
  },
  sectionDivider: {
    backgroundColor: colors.standardBorder,
    height: 1,
    marginVertical: 4,
  },
  readOnlyField: {
    backgroundColor: '#F3F0E8',
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  readOnlyText: {
    color: colors.mutedText,
    fontSize: 17,
    fontWeight: '800',
  },
  securitySection: {
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    marginTop: 4,
    padding: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionDetail: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.primaryGreen,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '900',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    marginTop: 4,
  },
  saveButtonText: {
    color: colors.warmWhite,
    fontSize: 18,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.7,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  messageText: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  loadingState: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    minHeight: 180,
  },
  loadingText: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '800',
  },
});
