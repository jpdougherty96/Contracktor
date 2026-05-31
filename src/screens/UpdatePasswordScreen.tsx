import { useState } from 'react';
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
import { Feather } from '@expo/vector-icons';

type UpdatePasswordScreenProps = {
  onSaved: () => void;
};

export function UpdatePasswordScreen({ onSaved }: UpdatePasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleUpdatePassword = async () => {
    setMessage(null);

    if (password.length < 6) {
      setMessage('Use at least 6 characters for your new password.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const { supabase } = await import('@/src/lib/supabase');
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(error.message);
        return;
      }

      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.appName}>conTRACKtor</Text>
            <Text style={styles.subtitle}>Set a new password for your account.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Reset password</Text>

            <View style={styles.passwordField}>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor="#8A94A6"
                secureTextEntry={!isPasswordVisible}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable
                accessibilityLabel={isPasswordVisible ? 'Hide new password' : 'Show new password'}
                onPress={() => setIsPasswordVisible((current) => !current)}
                style={styles.passwordVisibilityButton}>
                <Feather color="#64748B" name={isPasswordVisible ? 'eye-off' : 'eye'} size={22} />
              </Pressable>
            </View>

            <View style={styles.passwordField}>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor="#8A94A6"
                secureTextEntry={!isConfirmPasswordVisible}
                style={styles.passwordInput}
                value={confirmPassword}
              />
              <Pressable
                accessibilityLabel={
                  isConfirmPasswordVisible ? 'Hide confirmed password' : 'Show confirmed password'
                }
                onPress={() => setIsConfirmPasswordVisible((current) => !current)}
                style={styles.passwordVisibilityButton}>
                <Feather color="#64748B" name={isConfirmPasswordVisible ? 'eye-off' : 'eye'} size={22} />
              </Pressable>
            </View>

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Pressable
              disabled={isLoading}
              onPress={handleUpdatePassword}
              style={[styles.submitButton, isLoading && styles.disabledButton]}>
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Save new password</Text>
              )}
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
    flexGrow: 1,
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginTop: 32,
  },
  appName: {
    color: '#1F2933',
    fontSize: 36,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 18,
    lineHeight: 26,
    marginTop: 8,
    maxWidth: 360,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginTop: 28,
    padding: 16,
  },
  title: {
    color: '#1F2933',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
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
  passwordField: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
  },
  passwordInput: {
    color: '#1F2933',
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 0,
  },
  passwordVisibilityButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 52,
  },
  message: {
    color: '#7C2D12',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
