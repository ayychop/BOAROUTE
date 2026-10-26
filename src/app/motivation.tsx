import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { GlassCard } from '@/components/GlassCard';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { dailyQuote, LONG_READS } from '@/lib/motivation';
import { useTheme } from '@/theme/ThemeProvider';

/** Me > Premium Motivation: today's quote and longer pieces to read on a break. */
export default function Motivation() {
  const { palette } = useTheme();
  const [open, setOpen] = useState<string | null>(LONG_READS[0].id);

  return (
    <Screen back kicker="Premium" title="Motivation">
      <GlassCard glow="gold" animateIn={false}>
        <Txt variant="label" tone="gold" style={{ marginBottom: 8 }}>
          Today
        </Txt>
        <Txt variant="title" style={{ fontStyle: 'italic' }}>
          &ldquo;{dailyQuote(new Date())}&rdquo;
        </Txt>
      </GlassCard>

      <SectionHeader title="Read on your break" />
      <View style={{ gap: 10 }}>
        {LONG_READS.map((r, i) => {
          const expanded = open === r.id;
          return (
            <Animated.View key={r.id} layout={LinearTransition.springify().damping(18)}>
              <GlassCard
                index={i}
                glow={expanded ? 'gold' : false}
                accessibilityLabel={`${r.title}, ${r.minutes} minute read`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setOpen(expanded ? null : r.id);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" tone="primary">
                      {r.kicker} · {r.minutes} min read
                    </Txt>
                    <Txt variant="title" style={{ marginTop: 2 }}>
                      {r.title}
                    </Txt>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textFaint} />
                </View>
                {expanded && (
                  <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 12, gap: 10 }}>
                    {r.paragraphs.map((p, j) => (
                      <Txt key={j} variant="body" tone="dim" style={{ lineHeight: 24 }}>
                        {p}
                      </Txt>
                    ))}
                  </Animated.View>
                )}
              </GlassCard>
            </Animated.View>
          );
        })}
      </View>
    </Screen>
  );
}
