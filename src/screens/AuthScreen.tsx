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
import * as Linking from 'expo-linking';
import { Feather } from '@expo/vector-icons';

import { clearPasswordRecoveryRequested, markPasswordRecoveryRequested } from '@/src/lib/passwordRecovery';
import { ensureProfileForUser } from '@/src/lib/profiles';

type AuthScreenProps = {
  configError?: string | null;
};

type AuthMode = 'login' | 'reset' | 'signup';

export function AuthScreen({ configError }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [message, setMessage] = useState<string | null>(configError ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  const handleSubmit = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const { supabase } = await import('@/src/lib/supabase');
      const normalizedEmail = email.trim();

      if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: getAuthRedirectUrl('passwordRecovery'),
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        markPasswordRecoveryRequested();
        setMessage('Password reset email sent. Check your inbox for the reset link.');
        return;
      }

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim() || null,
              company_name: companyName.trim() || null,
            },
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });

        if (error) {
          setMessage(getSignupErrorMessage(error.message));
          return;
        }

        if (doesSignupResponseLookLikeExistingAccount(data.user)) {
          setMessage('This account already exists. Log in instead, or reset your password.');
          setMode('login');
          return;
        }

        if (!data.session) {
          setMessage('Account created. Check your email to confirm your account before logging in.');
          setMode('login');
          return;
        }

        if (data.user) {
          await ensureProfileForUser(data.user);
        }

        setMessage('Account created.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setMessage(getLoginErrorMessage(error.message));
        return;
      }

      if (data.user) {
        clearPasswordRecoveryRequested();
        await ensureProfileForUser(data.user);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(isSignup || isReset ? 'login' : 'signup');
    setMessage(null);
  };

  const showResetMode = () => {
    setMode('reset');
    setPassword('');
    setMessage(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.appName}>conTRACKtor</Text>
            <Text style={styles.subtitle}>Track job money before it gets away from you.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>
              {isSignup ? 'Create account' : isReset ? 'Reset password' : 'Log in'}
            </Text>

            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#8A94A6"
              style={styles.input}
              value={email}
            />

            {!isReset ? (
              <View style={styles.passwordField}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#8A94A6"
                  secureTextEntry={!isPasswordVisible}
                  style={styles.passwordInput}
                  value={password}
                />
                <Pressable
                  accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                  onPress={() => setIsPasswordVisible((current) => !current)}
                  style={styles.passwordVisibilityButton}>
                  <Feather color="#64748B" name={isPasswordVisible ? 'eye-off' : 'eye'} size={22} />
                </Pressable>
              </View>
            ) : null}

            {isSignup ? (
              <>
                <TextInput
                  autoCapitalize="words"
                  autoComplete="name"
                  onChangeText={setFullName}
                  placeholder="Full name"
                  placeholderTextColor="#8A94A6"
                  style={styles.input}
                  value={fullName}
                />
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setCompanyName}
                  placeholder="Company name"
                  placeholderTextColor="#8A94A6"
                  style={styles.input}
                  value={companyName}
                />
              </>
            ) : null}

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Pressable
              disabled={isLoading}
              onPress={handleSubmit}
              style={[styles.submitButton, isLoading && styles.disabledButton]}>
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isSignup ? 'Create account' : isReset ? 'Send reset email' : 'Log in'}
                </Text>
              )}
            </Pressable>

            {!isSignup && !isReset ? (
              <Pressable onPress={showResetMode} style={styles.secondaryLinkButton}>
                <Text style={styles.secondaryLinkText}>Forgot password?</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={toggleMode} style={styles.toggleButton}>
              <Text style={styles.toggleButtonText}>
                {isSignup || isReset ? 'Back to log in' : 'Need an account? Create one'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function doesSignupResponseLookLikeExistingAccount(user: unknown): boolean {
  const identities = (user as { identities?: unknown[] } | null)?.identities;

  return Array.isArray(identities) && identities.length === 0;
}

function getSignupErrorMessage(message: string): string {
  if (/already|registered|exists/i.test(message)) {
    return 'This account already exists. Log in instead, or reset your password.';
  }

  return message;
}

function getLoginErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'Email or password is incorrect. Try again, or reset your password.';
  }

  return message;
}

function getAuthRedirectUrl(flow?: 'passwordRecovery'): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(window.location.origin);

    if (flow === 'passwordRecovery') {
      url.searchParams.set('authFlow', 'password-recovery');
    }

    return url.toString();
  }

  return Linking.createURL(
    '/',
    flow === 'passwordRecovery'
      ? {
          queryParams: {
            authFlow: 'password-recovery',
          },
        }
      : undefined
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
  toggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  secondaryLinkText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '800',
  },
  toggleButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '800',
  },
});
