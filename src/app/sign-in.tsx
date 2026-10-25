import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BRLogo } from '@/components/BRLogo';
import { Field, Segmented } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useAuth } from '@/providers/AuthProvider';

type Mode = 'signin' | 'signup';

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const { compact, expanded } = useLayout();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (mode === 'signup' && !name.trim()) return setError('Tell us your name.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const needsConfirm = await signUp(email, password, name);
        if (needsConfirm) {
          setNotice('Check your inbox and tap the confirmation link, then sign in here.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const logo = compact ? 92 : expanded ? 170 : 132;

  return (
    <Screen>
      <View style={{ flexDirection: expanded ? 'row' : 'column', alignItems: 'center', gap: expanded ? 48 : 0, minHeight: expanded ? 520 : undefined }}>
        <Animated.View entering={FadeInUp.duration(700)} style={{ alignItems: 'center', flex: expanded ? 1 : undefined, marginTop: compact ? 4 : 24, marginBottom: compact ? 14 : 26 }}>
          <BRLogo size={logo} animated />
          <Txt variant={compact ? 'display' : 'hero'} glow style={{ marginTop: compact ? 10 : 18, letterSpacing: 4 }}>
            BOAROUTE
          </Txt>
          <Txt variant="label" tone="gold" style={{ marginTop: 6 }}>
            Field routes, reimagined
          </Txt>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(600)} style={{ width: '100%', maxWidth: 460, flex: expanded ? 1 : undefined }}>
          <GlassCard glow="primary">
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
              style={{ marginBottom: 18 }}
            />
            {mode === 'signup' && (
              <Field
                label="Your name"
                icon="person-outline"
                value={name}
                onChangeText={setName}
                placeholder="Sarah"
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            )}
            <Field
              ref={emailRef}
              label="Email"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            {error ? (
              <Txt variant="caption" tone="danger" style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
                {error}
              </Txt>
            ) : null}
            {notice ? (
              <Txt variant="caption" tone="success" style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
                {notice}
              </Txt>
            ) : null}
            <NeonButton label={mode === 'signin' ? 'Sign in' : 'Create account'} icon={mode === 'signin' ? 'arrow-forward' : 'person-add-outline'} onPress={submit} loading={busy} size="lg" full />
          </GlassCard>
        </Animated.View>
      </View>
    </Screen>
  );
}
