import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Chip, Field, Segmented } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState, LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { supabase } from '@/lib/supabaseClient';
import { DAILY_IQ_COUNT, TRAINING_TOPICS, isLive, type TrainingQuestion } from '@/lib/training';
import { useAuth } from '@/providers/AuthProvider';
import { generateTrainingQuestions } from '@/services/functions';

type Filter = 'review' | 'live' | 'off';

interface Draft {
  id: string | null;
  topic: string;
  question: string;
  answer: string;
}

const EMPTY: Draft = { id: null, topic: '', question: '', answer: '' };

const inFilter = (q: TrainingQuestion, f: Filter) => (f === 'review' ? !q.is_approved : f === 'live' ? isLive(q) : q.is_approved && !q.is_active);

async function fetchQuestions(): Promise<TrainingQuestion[]> {
  const { data, error } = await supabase.from('training_questions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrainingQuestion[];
}

export default function TrainingCenter() {
  const { isAdmin } = useAuth();
  const [questions, setQuestions] = useState<TrainingQuestion[] | null>(null);
  const [filter, setFilter] = useState<Filter>('live');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [specs, setSpecs] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQuestions(await fetchQuestions());
    } catch (e) {
      Alert.alert('Could not load questions', e instanceof Error ? e.message : 'Please try again.');
      setQuestions((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetchQuestions()
      .then((rows) => alive && setQuestions(rows))
      .catch((e: unknown) => {
        if (!alive) return;
        Alert.alert('Could not load questions', e instanceof Error ? e.message : 'Please try again.');
        setQuestions([]);
      });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Screen back title="Training Center">
        <EmptyState icon="lock-closed-outline" title="Admins only" body="Only the admin can manage training questions." />
      </Screen>
    );
  }

  if (!questions) {
    return (
      <Screen back kicker="Admin portal" title="Training Center">
        <LoadingBlock label="Loading questions" />
      </Screen>
    );
  }

  const run = async (key: string, task: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(key);
    try {
      const { error } = await task();
      if (error) Alert.alert('Could not update', error.message);
      else Haptics.selectionAsync().catch(() => {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setFormError(null);
    const row = { topic: draft.topic.trim(), question: draft.question.trim(), answer: draft.answer.trim() };
    if (!row.topic) return setFormError('Pick or type a topic.');
    if (row.question.length < 3) return setFormError('Write the question.');
    if (!row.answer) return setFormError('Write the answer.');
    setBusy('save');
    const { error } = draft.id ? await supabase.from('training_questions').update(row).eq('id', draft.id) : await supabase.from('training_questions').insert(row);
    setBusy(null);
    if (error) return setFormError(error.code === '23505' ? 'That question is already in the pool.' : error.message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setDraft(null);
    if (!draft.id) setFilter('live');
    load();
  };

  const generate = async () => {
    setAiError(null);
    if (!specs.trim()) return setAiError('Type the latest specs first.');
    setBusy('ai');
    try {
      await generateTrainingQuestions(specs);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSpecs('');
      setSpecsOpen(false);
      setFilter('review');
      await load();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Could not generate questions.');
    } finally {
      setBusy(null);
    }
  };

  const remove = (q: TrainingQuestion) =>
    Alert.alert(q.is_approved ? 'Delete this question?' : 'Reject this question?', 'It is removed for good. To hide it for now, switch it off instead.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(`delete:${q.id}`, () => supabase.from('training_questions').delete().eq('id', q.id)) },
    ]);

  const counts = {
    review: questions.filter((q) => inFilter(q, 'review')).length,
    live: questions.filter((q) => inFilter(q, 'live')).length,
    off: questions.filter((q) => inFilter(q, 'off')).length,
  };
  const shown = questions.filter((q) => inFilter(q, filter));

  const form = draft && (
    <GlassCard glow="gold" animateIn={false}>
      <Txt variant="title" style={{ marginBottom: 12 }}>
        {draft.id ? 'Edit question' : 'New question'}
      </Txt>
      <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
        Topic
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {TRAINING_TOPICS.map((t) => (
          <Chip key={t} label={t} active={draft.topic === t} tone="gold" onPress={() => setDraft({ ...draft, topic: t })} />
        ))}
      </View>
      <Field label="Or type a topic" icon="pricetag-outline" value={draft.topic} onChangeText={(topic) => setDraft({ ...draft, topic })} placeholder="e.g. Galaxy S26 Ultra" maxLength={40} />
      <Field label="Question" value={draft.question} onChangeText={(question) => setDraft({ ...draft, question })} multiline maxLength={400} placeholder="What does a customer need to know?" />
      <Field label="Answer" value={draft.answer} onChangeText={(answer) => setDraft({ ...draft, answer })} multiline maxLength={1000} placeholder="One or two sentences staff can repeat" />
      {formError ? (
        <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
          {formError}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <NeonButton label={draft.id ? 'Save changes' : 'Add question'} icon="checkmark" variant="gold" onPress={save} loading={busy === 'save'} disabled={!!busy} style={{ flex: 1 }} />
        <NeonButton label="Cancel" variant="ghost" onPress={() => setDraft(null)} disabled={busy === 'save'} style={{ flex: 1 }} />
      </View>
    </GlassCard>
  );

  return (
    <Screen back kicker="Admin portal" title="Training Center" onRefresh={load}>
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        Daily Samsung IQ shows {DAILY_IQ_COUNT} live questions a day on Home, rotating at midnight. {counts.live} live now.
      </Txt>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <NeonButton label="Add question" icon="add" variant="gold" size="sm" onPress={() => { setFormError(null); setDraft(EMPTY); }} disabled={!!busy} style={{ flex: 1 }} />
        <NeonButton label="Generate with AI" icon="sparkles" variant="ghost" size="sm" onPress={() => setSpecsOpen((o) => !o)} disabled={!!busy && busy !== 'ai'} style={{ flex: 1 }} />
      </View>

      {specsOpen && (
        <Animated.View entering={FadeInDown.duration(220)} style={{ marginBottom: 14 }}>
          <GlassCard glow="gold" animateIn={false}>
            <Txt variant="strong" style={{ marginBottom: 4 }}>
              Generate 3 questions
            </Txt>
            <Txt variant="caption" tone="dim" style={{ marginBottom: 12 }}>
              Paste the latest specs. New questions wait in Review until you approve them.
            </Txt>
            <Field label="Specs" value={specs} onChangeText={setSpecs} multiline maxLength={3000} placeholder="Galaxy S26 Ultra, 200MP camera, Snapdragon X, 5000mAh battery" />
            {aiError ? (
              <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
                {aiError}
              </Txt>
            ) : null}
            <NeonButton label={busy === 'ai' ? 'Writing questions' : 'Generate'} icon="sparkles" variant="gold" onPress={generate} loading={busy === 'ai'} disabled={!!busy} full />
          </GlassCard>
        </Animated.View>
      )}

      {draft && !draft.id && <View style={{ marginBottom: 14 }}>{form}</View>}

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'review', label: `Review · ${counts.review}`, icon: 'eye-outline' },
          { value: 'live', label: `Live · ${counts.live}`, icon: 'checkmark-circle-outline' },
          { value: 'off', label: `Off · ${counts.off}`, icon: 'pause-circle-outline' },
        ]}
        style={{ marginBottom: 14 }}
      />

      {shown.length === 0 ? (
        <GlassCard animateIn={false}>
          <Txt variant="body" tone="dim" align="center">
            {filter === 'review' ? 'Nothing to review. AI questions land here first.' : filter === 'live' ? 'No live questions. Add one or approve some from Review.' : 'No questions are switched off.'}
          </Txt>
        </GlassCard>
      ) : (
        <View style={{ gap: 10 }}>
          {shown.map((q, i) =>
            draft?.id === q.id ? (
              <View key={q.id}>{form}</View>
            ) : (
              <Animated.View key={q.id} layout={LinearTransition}>
                <GlassCard index={i} glow={q.is_approved ? false : 'gold'}>
                  <Txt variant="label" tone="gold" style={{ marginBottom: 6 }}>
                    {q.topic}
                    {q.is_approved ? '' : ' · AI draft'}
                  </Txt>
                  <Txt variant="strong">{q.question}</Txt>
                  <Txt variant="body" tone="dim" style={{ marginTop: 6, marginBottom: 12 }}>
                    {q.answer}
                  </Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {!q.is_approved && (
                      <NeonButton label="Approve" icon="checkmark-circle" variant="gold" size="sm" onPress={() => run(`approve:${q.id}`, () => supabase.from('training_questions').update({ is_approved: true, is_active: true }).eq('id', q.id))} loading={busy === `approve:${q.id}`} disabled={!!busy} />
                    )}
                    <NeonButton label="Edit" icon="create-outline" variant="subtle" size="sm" onPress={() => { setFormError(null); setDraft({ id: q.id, topic: q.topic, question: q.question, answer: q.answer }); }} disabled={!!busy} />
                    {q.is_approved && (
                      <NeonButton
                        label={q.is_active ? 'Switch off' : 'Switch on'}
                        icon={q.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                        variant="subtle"
                        size="sm"
                        onPress={() => run(`active:${q.id}`, () => supabase.from('training_questions').update({ is_active: !q.is_active }).eq('id', q.id))}
                        loading={busy === `active:${q.id}`}
                        disabled={!!busy}
                      />
                    )}
                    <NeonButton label={q.is_approved ? 'Delete' : 'Reject'} icon="trash-outline" variant="subtle" size="sm" onPress={() => remove(q)} loading={busy === `delete:${q.id}`} disabled={!!busy} />
                  </View>
                </GlassCard>
              </Animated.View>
            ),
          )}
        </View>
      )}
    </Screen>
  );
}
