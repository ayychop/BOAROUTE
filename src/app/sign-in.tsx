import { Ionicons } from '@expo/vector-icons';
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
import { useTheme } from '@/theme/ThemeProvider';

type Mode = 'signin' | 'signup';

export default function SignIn() {
  const { signIn, signUp, session, profile } = useAuth();
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
            {session && profile ? (
              <AccessPending email={profile.email || session.user.email || ''} denied={profile.role === 'denied'} />
            ) : (
              <>
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
              </>
            )}
          </GlassCard>
        </Animated.View>
      </View>
    </Screen>
  );
}

/**
 * Signed in, but the email is not on the team list yet (or was declined).
 * They stay here: the database gives them no stores and no data.
 */
function AccessPending({ email, denied }: { email: string; denied: boolean }) {
  const { refreshProfile, signOut } = useAuth();
  const { palette } = useTheme();
  const [checking, setChecking] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const accent = denied ? palette.platinum : palette.gold;

  const checkAgain = async () => {
    setChecking(true);
    setStillWaiting(false);
    try {
      await refreshProfile();
    } finally {
      // Once approved this screen unmounts and the app opens.
      setChecking(false);
      setStillWaiting(true);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center' }} accessibilityLiveRegion="polite">
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: accent + '22', borderWidth: 1, borderColor: accent, marginBottom: 14 }}>
        <Ionicons name={denied ? 'lock-closed-outline' : 'paper-plane-outline'} size={28} color={accent} />
      </View>
      <Txt variant="title" align="center" style={{ marginBottom: 8 }}>
        {denied ? 'Not approved' : 'Request sent'}
      </Txt>
      <Txt variant="body" tone="dim" align="center" style={{ marginBottom: 6 }}>
        {denied
          ? 'The Admin has not approved this email for BOAROUTE. If you think this is a mistake, please get in touch with them.'
          : 'Your email has been sent to the Admin for approval. Please check back soon.'}
      </Txt>
      {email ? (
        <Txt variant="caption" tone="faint" align="center" style={{ marginBottom: 18 }} numberOfLines={1}>
          {email}
        </Txt>
      ) : null}
      {stillWaiting && !denied ? (
        <Txt variant="caption" tone="gold" align="center" style={{ marginBottom: 12 }}>
          Still waiting. You will get straight in once you are approved.
        </Txt>
      ) : null}
      <View style={{ gap: 10, alignSelf: 'stretch' }}>
        {!denied && <NeonButton label="Check again" icon="refresh" variant="gold" onPress={checkAgain} loading={checking} size="lg" full />}
        <NeonButton label="Use a different email" icon="swap-horizontal" variant="ghost" onPress={() => signOut().catch(() => {})} full />
      </View>
    </Animated.View>
  );
}
