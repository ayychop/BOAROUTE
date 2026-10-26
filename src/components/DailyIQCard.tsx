import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { supabase } from '@/lib/supabaseClient';
import { dailyQuestions, type TrainingQuestion } from '@/lib/training';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

/** One question: tap to flip the answer in, tap again to hide it. */
function QuestionPage({ q, n, total, width, revealed, onToggle }: { q: TrainingQuestion; n: number; total: number; width: number; revealed: boolean; onToggle: () => void }) {
  const { palette } = useTheme();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <View style={{ width, paddingHorizontal: 2 }}>
      <Pressable
        onPress={onToggle}
        onPressIn={() => scale.set(withSpring(0.97, springs.press))}
        onPressOut={() => scale.set(withSpring(1, springs.release))}
        accessibilityRole="button"
        accessibilityLabel={`Question ${n} of ${total}: ${q.question}`}
        accessibilityHint={revealed ? 'Hides the answer' : 'Shows the answer'}
        accessibilityState={{ expanded: revealed }}
      >
        <Animated.View style={[{ minHeight: 168, borderRadius: radius.lg, padding: 16, backgroundColor: 'rgba(0,0,0,0.38)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: revealed ? palette.borderStrong : palette.border }, pressStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.borderStrong, flexShrink: 1 }}>
              <Txt variant="label" tone="gold" numberOfLines={1} style={{ fontSize: 9.5 }}>
                {q.topic}
              </Txt>
            </View>
            <Txt variant="label" tone="faint" style={{ fontSize: 9.5 }}>
              {n} / {total}
            </Txt>
          </View>
          <Txt variant="heading">{q.question}</Txt>
          {revealed ? (
            <Animated.View key="answer" entering={FadeInDown.duration(260)} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: palette.borderStrong }}>
              <Txt variant="body" style={{ color: palette.gold }}>
                {q.answer}
              </Txt>
            </Animated.View>
          ) : (
            <Animated.View key="hint" entering={FadeIn.duration(200)} style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="eye-outline" size={14} color={palette.textFaint} />
              <Txt variant="caption" tone="faint">
                Tap to reveal the answer
              </Txt>
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Page dot that stretches gold as its question scrolls into view. */
function Dot({ i, x, width }: { i: number; x: SharedValue<number>; width: number }) {
  const { palette } = useTheme();
  const style = useAnimatedStyle(() => {
    const t = width > 0 ? Math.max(0, 1 - Math.abs(x.get() / width - i)) : i === 0 ? 1 : 0;
    return { width: interpolate(t, [0, 1], [6, 18]), opacity: interpolate(t, [0, 1], [0.35, 1]) };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: palette.gold }, style]} />;
}

/** Daily Samsung IQ on Home: five questions a day from the approved pool, swipe through and tap to reveal. */
export function DailyIQCard({ now, index = 0 }: { now: number; index?: number }) {
  const { palette } = useTheme();
  const [pool, setPool] = useState<TrainingQuestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.set(e.contentOffset.x);
  });

  useEffect(() => {
    let alive = true;
    // RLS returns only live (approved and active) questions to the team.
    supabase
      .from('training_questions')
      .select('*')
      .eq('is_active', true)
      .eq('is_approved', true)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setFailed(true);
        setPool((data ?? []) as TrainingQuestion[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Recomputed from the date only, so the set changes at midnight and not on every tick.
  const dayKey = new Date(now).toDateString();
  const today = useMemo(() => (pool ? dailyQuestions(pool, new Date(dayKey)) : []), [pool, dayKey]);

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    // Keyed by day, so tomorrow starts hidden even when a question comes round again.
    setRevealed((r) => ({ ...r, [`${dayKey}:${id}`]: !r[`${dayKey}:${id}`] }));
  };
  const isRevealed = (id: string) => !!revealed[`${dayKey}:${id}`];
  const seen = today.filter((q) => isRevealed(q.id)).length;

  return (
    <GlassCard index={index} glow="gold">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="school" size={16} color={palette.gold} />
        <Txt variant="label" tone="gold" style={{ flex: 1 }} numberOfLines={1}>
          Daily Samsung IQ
        </Txt>
        {today.length > 0 && (
          <Txt variant="label" tone="faint" style={{ fontSize: 9.5 }}>
            {seen} of {today.length} revealed
          </Txt>
        )}
      </View>
      <View style={{ height: 1, backgroundColor: palette.gold, opacity: 0.35, marginBottom: 12 }} />

      <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {pool === null ? (
          <View style={{ minHeight: 168, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.25)' }} />
        ) : today.length === 0 ? (
          <Txt variant="body" tone="dim">
            {failed ? 'Could not load today’s questions. Check your connection and reopen the app.' : 'No questions are live yet. The admin adds them in Training Center.'}
          </Txt>
        ) : width > 0 ? (
          <>
            <Animated.ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} decelerationRate="fast" accessibilityRole="adjustable">
              {today.map((q, i) => (
                <QuestionPage key={q.id} q={q} n={i + 1} total={today.length} width={width} revealed={isRevealed(q.id)} onToggle={() => toggle(q.id)} />
              ))}
            </Animated.ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              {today.map((q, i) => (
                <Dot key={q.id} i={i} x={x} width={width} />
              ))}
            </View>
          </>
        ) : null}
      </View>

      <Pressable
        onPress={() =>
          router.push({
            pathname: '/task-new',
            params: { title: 'Training conversation', content: today.length ? `Daily Samsung IQ topics: ${[...new Set(today.map((q) => q.topic))].join(', ')}\n\n` : '' },
          })
        }
        accessibilityRole="button"
        hitSlop={8}
        style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Ionicons name="create-outline" size={15} color={palette.primary} />
        <Txt variant="label" tone="primary">
          Log Training
        </Txt>
        <Ionicons name="arrow-forward" size={14} color={palette.primary} />
      </Pressable>
    </GlassCard>
  );
}
