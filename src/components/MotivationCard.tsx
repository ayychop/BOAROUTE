import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { dailyQuote, dailyQuoteIndex } from '@/lib/motivation';
import { useTheme } from '@/theme/ThemeProvider';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

/** Today's quote on the Hub. A new one each day; tap the arrows for more. */
export function MotivationCard({ now, index = 0 }: { now: number; index?: number }) {
  const { palette } = useTheme();
  const [offset, setOffset] = useState(0);
  const date = new Date(now);
  const quote = dailyQuote(date, offset);
  const step = (by: number) => {
    Haptics.selectionAsync().catch(() => {});
    setOffset((o) => o + by);
  };

  return (
    <GlassCard index={index} glow="gold">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="flame" size={16} color={palette.gold} />
        <Txt variant="label" tone="gold" style={{ flex: 1 }}>
          {offset === 0 ? 'Motivation · today' : 'Motivation'}
        </Txt>
        <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous quote">
          <Ionicons name="chevron-back" size={18} color={palette.textDim} />
        </Pressable>
        <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next quote">
          <Ionicons name="chevron-forward" size={18} color={palette.textDim} />
        </Pressable>
      </View>
      <Animated.View key={dailyQuoteIndex(date, offset)} entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} accessibilityLiveRegion="polite">
        <Txt variant="heading" style={{ fontStyle: 'italic' }}>
          &ldquo;{quote}&rdquo;
        </Txt>
      </Animated.View>
      <Pressable onPress={() => router.push('/motivation')} accessibilityRole="link" hitSlop={8} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="label" tone="primary">
          Premium Motivation
        </Txt>
        <Ionicons name="arrow-forward" size={14} color={palette.primary} />
      </Pressable>
    </GlassCard>
  );
}
