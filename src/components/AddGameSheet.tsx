import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { normaliseGameUrl, titleFromDomain } from '@/lib/game-link';

const GOLD = '#E8CF94';
const INK = 'rgba(245,240,230,0.94)';
const DIM = 'rgba(245,240,230,0.6)';

interface Props {
  /** Adds the link. Resolves null when it worked, or the message to show when it did not. */
  onAdd: (input: string, onStep: (label: string) => void) => Promise<string | null>;
  onClose: () => void;
}

/**
 * Paste a game link: it becomes a card named after the site, with the site's
 * own cover art. Mount it only while open, so it starts fresh every time.
 */
export function AddGameSheet({ onAdd, onClose }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsed = value.trim() ? normaliseGameUrl(value) : null;
  const preview = parsed?.ok ? `${titleFromDomain(parsed.host)} · ${parsed.host}` : null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStep('Checking the link');
    const problem = await onAdd(value, setStep).catch(() => 'Something went wrong. Please try again.');
    if (problem) {
      setBusy(false);
      setError(problem);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    }
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text) {
      setValue(text.trim());
      setError(null);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 20, paddingTop: 96 }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
        <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', borderRadius: 22, padding: 20, backgroundColor: '#14151A', borderWidth: 1, borderColor: 'rgba(255,240,210,0.16)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="add-circle" size={26} color={GOLD} />
            <Txt variant="title" style={{ color: INK, flex: 1 }}>
              Add a game
            </Txt>
            <Pressable onPress={onClose} disabled={busy} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={DIM} />
            </Pressable>
          </View>
          <Txt variant="caption" style={{ color: DIM, marginTop: 6 }}>
            Paste the link to any browser game. It gets the site&apos;s name and cover art, and is saved to your library.
          </Txt>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: error ? '#F2B36B' : 'rgba(255,240,210,0.2)', backgroundColor: 'rgba(255,255,255,0.06)', paddingLeft: 14, paddingRight: 6 }}>
            <Ionicons name="link" size={18} color={DIM} />
            <TextInput
              value={value}
              onChangeText={(t) => {
                setValue(t);
                setError(null);
              }}
              placeholder="https://krunker.io"
              placeholderTextColor="rgba(245,240,230,0.35)"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardType="url"
              returnKeyType="go"
              editable={!busy}
              onSubmitEditing={submit}
              accessibilityLabel="Game link"
              style={{ flex: 1, color: INK, fontSize: 16, paddingVertical: 14 }}
            />
            <Pressable onPress={paste} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Paste from clipboard" style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Txt variant="strong" style={{ color: GOLD }}>
                Paste
              </Txt>
            </Pressable>
          </View>

          <Txt variant="caption" style={{ color: error ? '#F2B36B' : DIM, marginTop: 10, minHeight: 18 }} accessibilityLiveRegion="polite">
            {error ?? (busy ? step : (preview ?? ' '))}
          </Txt>

          <NeonButton label={busy ? 'Adding' : 'Add game'} icon="add" size="lg" loading={busy} disabled={!value.trim()} onPress={submit} onDark full style={{ marginTop: 14 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
