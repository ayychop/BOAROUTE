import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { copyText } from '@/lib/external';
import { dailyQuote, dailyQuoteIndex, quotesFor } from '@/lib/motivation';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

/** Today's Real Talk quote on the Hub. A new one each day; tap the arrows for more, share it or long-press to copy. */
export function MotivationCard({ now, index = 0 }: { now: number; index?: number }) {
  const { palette } = useTheme();
  const { isAdmin } = useAuth();
  const quotes = quotesFor(isAdmin);
  const [offset, setOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const date = new Date(now);
  const quote = dailyQuote(date, offset, quotes);
  const step = (by: number) => {
    Haptics.selectionAsync().catch(() => {});
    setOffset((o) => o + by);
  };
  const shareText = `\u201C${quote}\u201D\n\nDaily Real Talk from BOAROUTE`;
  const copy = async () => {
    if (!(await copyText(shareText))) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  // The share sheet covers Instagram, Messages and Copy; browsers without one just copy.
  const share = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS === 'web' && !(typeof navigator !== 'undefined' && 'share' in navigator)) return copy();
    try {
      await Share.share({ message: shareText });
    } catch {
      await copy();
    }
  };

  return (
    <GlassCard index={index} glow="gold">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="flame" size={16} color={palette.gold} />
        <Txt variant="label" tone="gold" style={{ flex: 1 }}>
          {copied ? 'Copied' : offset === 0 ? 'Real Talk · today' : 'Real Talk'}
        </Txt>
        <Pressable onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share quote">
          <Ionicons name="share-outline" size={18} color={palette.gold} />
        </Pressable>
        <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous quote">
          <Ionicons name="chevron-back" size={18} color={palette.textDim} />
        </Pressable>
        <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next quote">
          <Ionicons name="chevron-forward" size={18} color={palette.textDim} />
        </Pressable>
      </View>
      <View style={{ height: 1, backgroundColor: palette.gold, opacity: 0.35, marginBottom: 12 }} />
      <Pressable onLongPress={copy} accessibilityHint="Long-press to copy">
        <Animated.View key={dailyQuoteIndex(date, offset, quotes)} entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} accessibilityLiveRegion="polite">
          <Txt variant="display" tone="gold" style={{ fontSize: 48, lineHeight: 44, marginBottom: -16 }} accessible={false}>
            &ldquo;
          </Txt>
          <Txt variant="heading" style={{ fontStyle: 'italic' }}>
            {quote}
          </Txt>
        </Animated.View>
      </Pressable>
      <Pressable onPress={() => router.push('/motivation')} accessibilityRole="link" hitSlop={8} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="label" tone="primary">
          Premium Motivation
        </Txt>
        <Ionicons name="arrow-forward" size={14} color={palette.primary} />
      </Pressable>
    </GlassCard>
  );
}
