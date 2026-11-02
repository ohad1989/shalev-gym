import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme';

const MIN_PASSWORD_LENGTH = 8;

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const theme = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const creating = mode === 'signUp';

  async function submit() {
    const address = email.trim();
    setNotice(null);
    if (!address.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (creating && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      if (creating) {
        const needsConfirmation = await signUp(address, password);
        if (needsConfirmation) {
          setNotice(`We sent a confirmation link to ${address}. Open it, then sign in.`);
          setMode('signIn');
          setPassword('');
        }
      } else {
        await signIn(address, password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
  ];

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {creating ? 'Create your account' : 'Sign in'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Log every workout and keep track of your progress.
            </Text>

            <Text style={[styles.label, { color: theme.text }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              inputMode="email"
              onChangeText={setEmail}
              style={inputStyle}
              textContentType="emailAddress"
              value={email}
            />

            <Text style={[styles.label, { color: theme.text }]}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete={creating ? 'new-password' : 'current-password'}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              secureTextEntry
              style={inputStyle}
              textContentType={creating ? 'newPassword' : 'password'}
              value={password}
            />

            {error && (
              <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.danger }]}>
                {error}
              </Text>
            )}
            {notice && (
              <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.text }]}>
                {notice}
              </Text>
            )}

            <View style={styles.submit}>
              <Button busy={busy} label={creating ? 'Create account' : 'Sign in'} onPress={submit} />
            </View>

            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setMode(creating ? 'signIn' : 'signUp');
                setError(null);
                setNotice(null);
              }}
              style={styles.switch}>
              <Text style={[styles.switchLabel, { color: theme.accent }]}>
                {creating ? 'I already have an account' : 'Create an account'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  form: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '700' },
  subtitle: { fontSize: 16, marginTop: 6, marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  message: { fontSize: 15, marginTop: 14 },
  submit: { marginTop: 22 },
  switch: { alignSelf: 'center', marginTop: 18, padding: 6 },
  switchLabel: { fontSize: 16, fontWeight: '600' },
});
