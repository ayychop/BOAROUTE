import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, View, type ScrollViewInstance } from 'react-native';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { Mood, WriterContext, WriterResult } from '../../supabase/functions/_shared/writer-prompt';
import { Field, Segmented } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { copyText } from '@/lib/external';
import { firstName } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { draftMessage } from '@/services/functions';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

const MOODS: { value: Mood; icon: keyof typeof Ionicons.glyphMap; hint: string }[] = [
  { value: 'Professional', icon: 'briefcase', hint: 'Calm and clear' },
  { value: 'Urgent', icon: 'alarm', hint: 'Action needed now' },
  { value: 'Friendly', icon: 'happy', hint: 'Warm and personal' },
  { value: 'Stern', icon: 'hand-left', hint: 'Firm but fair' },
];

/** Reveals text a few characters at a time, like a live typist. */
function useTypewriter(text: string) {
  // Progress is stored with the text it belongs to, so a new draft restarts from zero.
  const [progress, setProgress] = useState({ text: '', count: 0 });
  useEffect(() => {
    if (!text) return;
    let i = 0;
    const step = Math.max(2, Math.round(text.length / 120));
    const timer = setInterval(() => {
      i = Math.min(text.length, i + step);
      setProgress({ text, count: i });
      if (i >= text.length) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [text]);
  return progress.text === text ? text.slice(0, progress.count) : '';
}

function ScanLoader() {
  const { palette } = useTheme();
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(x);
  }, [x]);
  const bar = useAnimatedStyle(() => ({ left: `${x.value * 70}%` }));
  return (
    <View style={{ gap: 10, paddingVertical: 8 }} accessibilityLabel="Drafting">
      <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.border, overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: '30%', borderRadius: 2, backgroundColor: palette.gold }, bar]} />
      </View>
      <Txt variant="label" tone="gold">
        Composing in your voice
      </Txt>
    </View>
  );
}

export default function AiWriter() {
  const { storeId, notes: initialNotes } = useLocalSearchParams<{ storeId?: string; notes?: string }>();
  const { palette } = useTheme();
  const { profile } = useAuth();
  const { stores } = useData();
  const store = stores.find((s) => s.id === storeId);

  const [context, setContext] = useState<WriterContext>('email');
  const [mood, setMood] = useState<Mood>('Professional');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WriterResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const typed = useTypewriter(result?.body ?? '');
  const scrollRef = useRef<ScrollViewInstance>(null);
  // The draft card sits below the form, so bring it into view when drafting starts and when it lands.
  const showDraft = () => scrollRef.current?.scrollToEnd({ animated: true });
  useEffect(() => {
    if (!busy && !result) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [busy, result]);

  const fullText = result ? (result.subject ? `Subject: ${result.subject}\n\n${result.body}` : result.body) : '';

  const draft = async () => {
    setError(null);
    if (!notes.trim()) return setError('Jot down a few rough notes first.');
    setBusy(true);
    setResult(null);
    setSaved(false);
    try {
      const r = await draftMessage({
        notes,
        context,
        mood,
        storeName: store?.name ?? null,
        recipient: context === 'email' ? recipient : null,
        senderName: firstName(profile?.name, profile?.email),
      });
      setResult(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft right now.');
    } finally {
      setBusy(false);
    }
  };

  const saveAsTask = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    const title = result.subject ?? result.body.split('\n')[0].slice(0, 120) ?? 'AI draft';
    try {
      const { error: err } = await supabase.from('tasks').insert({
        store_id: storeId ?? null,
        title: title || 'AI draft',
        content: result.subject ? result.body : result.body.split('\n').slice(1).join('\n').trim() || result.body,
        media_urls: [],
        task_type: context,
      });
      if (err) throw err;
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save the draft. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen back kicker={store ? store.name : 'AI Typer'} title="Draft a Message" scrollRef={scrollRef}>
      <SectionHeader title="1 · What are you writing?" />
      <Segmented
        big
        value={context}
        onChange={setContext}
        options={[
          { value: 'note', label: 'Note', icon: 'document-text' },
          { value: 'email', label: 'Email', icon: 'mail' },
        ]}
      />

      <SectionHeader title="2 · Mood" />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {MOODS.map((m, i) => {
          const active = mood === m.value;
          return (
            // Two per row on every screen width, so "Professional" always has room.
            <Animated.View key={m.value} entering={FadeInDown.delay(i * 60)} style={{ width: '48%', flexGrow: 1 }}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${m.value} mood`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMood(m.value);
                }}
                style={{
                  borderRadius: radius.md,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? palette.gold : palette.border,
                  backgroundColor: active ? palette.goldGlow : palette.surface,
                  padding: 12,
                  minHeight: 96,
                  gap: 6,
                }}
              >
                <Ionicons name={m.icon} size={20} color={active ? palette.text : palette.gold} />
                <Txt variant="strong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {m.value}
                </Txt>
                <Txt variant="caption" tone={active ? 'default' : 'faint'} numberOfLines={2} ellipsizeMode="clip">
                  {m.hint}
                </Txt>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <SectionHeader title="3 · Your rough notes" />
      <GlassCard>
        {context === 'email' && <Field label="To (optional)" icon="person-outline" value={recipient} onChangeText={setRecipient} placeholder="e.g. Dave, store manager" autoCapitalize="words" />}
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="e.g. promo bay half empty, 14 units in back, need restock by fri, staff great" maxLength={6000} />
        {error ? (
          <Txt variant="caption" tone="danger" style={{ marginBottom: 12 }}>
            {error}
          </Txt>
        ) : null}
        <NeonButton label={result ? 'Rewrite again' : 'Draft with AI'} icon="sparkles" variant="gold" onPress={draft} loading={busy} size="lg" full />
        {result && !busy ? (
          <Pressable onPress={showDraft} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            <Ionicons name="checkmark-circle" size={16} color={palette.gold} />
            <Txt variant="label" tone="gold">
              Draft ready · see below
            </Txt>
            <Ionicons name="arrow-down" size={14} color={palette.gold} />
          </Pressable>
        ) : null}
      </GlassCard>

      {(busy || result) && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 12 }}>
            <Ionicons name="sparkles" size={18} color={palette.gold} />
            <Txt variant="title" tone="gold">
              {busy ? 'Writing your draft…' : 'Your draft'}
            </Txt>
          </View>
          <GlassCard glow="gold">
            {busy ? (
              <ScanLoader />
            ) : result ? (
              <>
                {result.subject ? (
                  <View style={{ marginBottom: 10 }}>
                    <Txt variant="label" tone="gold">
                      Subject
                    </Txt>
                    <Txt variant="heading" selectable>
                      {result.subject}
                    </Txt>
                  </View>
                ) : null}
                <Txt variant="body" selectable style={{ lineHeight: 24 }}>
                  {typed}
                  {typed.length < result.body.length ? <Txt tone="gold">▍</Txt> : null}
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                  <NeonButton
                    size="sm"
                    icon={copied ? 'checkmark' : 'copy'}
                    label={copied ? 'Copied' : 'Copy'}
                    onPress={async () => {
                      if (!(await copyText(fullText))) return;
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  />
                  <NeonButton size="sm" variant="subtle" icon="share-social" label="Share" onPress={() => Share.share({ message: fullText, title: result.subject ?? undefined }).catch(() => {})} />
                  <NeonButton size="sm" variant="subtle" icon={saved ? 'checkmark-done' : 'bookmark'} label={saved ? 'Saved to tasks' : 'Save as task'} onPress={saveAsTask} loading={saving} disabled={saved} />
                  {saved && storeId ? <NeonButton size="sm" variant="ghost" label="Back to store" onPress={() => router.back()} /> : null}
                </View>
              </>
            ) : null}
          </GlassCard>
        </View>
      )}
    </Screen>
  );
}
