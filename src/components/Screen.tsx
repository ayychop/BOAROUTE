import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { AmbientBackground } from './AmbientBackground';
import { Txt } from './Txt';

interface Props {
  children: ReactNode;
  title?: string;
  kicker?: string;
  back?: boolean;
  right?: ReactNode;
  /** Scrollable by default so nothing is ever clipped on a Flip cover screen. */
  scroll?: boolean;
  /** Tab screens sit above the tab bar, so they need no bottom inset. */
  inTabs?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: ReactNode;
  /** Rendered outside the navigator (setup and error states), so focus is unknown. */
  standalone?: boolean;
}

/** Only the screen in front animates its ambiance; screens behind it hold a still frame. */
function FocusedAmbience() {
  const focused = useIsFocused();
  return <AmbientBackground animated={focused} />;
}

export function Screen({ children, title, kicker, back, right, scroll = true, inTabs = false, onRefresh, refreshing = false, footer, standalone = false }: Props) {
  const { palette } = useTheme();
  const { insets, gutter, maxContent, compact } = useLayout();

  const header =
    title || back || right ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: compact ? 10 : 16 }}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            <Ionicons name="chevron-back" size={20} color={palette.gold} />
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {kicker ? (
            <Txt variant="label" tone="primary" numberOfLines={1}>
              {kicker}
            </Txt>
          ) : null}
          {title ? (
            <Txt variant={compact ? 'title' : 'display'} numberOfLines={2}>
              {title}
            </Txt>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  const padding = {
    paddingTop: insets.top + (compact ? 8 : 14),
    paddingBottom: (inTabs ? 28 : insets.bottom + 28) + (footer ? 110 : 0),
    paddingLeft: Math.max(gutter, insets.left + 8),
    paddingRight: Math.max(gutter, insets.right + 8),
  };
  const inner = { width: '100%' as const, maxWidth: maxContent, alignSelf: 'center' as const };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg[0] }}>
      <StatusBar style={palette.statusBar} animated />
      {standalone ? <AmbientBackground /> : <FocusedAmbience />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={padding}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} colors={[palette.primary]} progressBackgroundColor={palette.surfaceStrong} />
              ) : undefined
            }
          >
            <Animated.View entering={FadeIn.duration(420)} style={inner}>
              {header}
              {children}
            </Animated.View>
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padding]}>
            <View style={[inner, { flex: 1 }]}>
              {header}
              {children}
            </View>
          </View>
        )}
        {footer ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: Math.max(gutter, insets.left + 8),
              paddingBottom: (inTabs ? 12 : insets.bottom + 12),
              paddingTop: 28,
            }}
          >
            <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', palette.bg[2]]} locations={[0, 0.45]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={inner}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        <SectionRule />
        <Txt variant="label" tone="dim" style={{ flexShrink: 1 }} numberOfLines={1}>
          {title}
        </Txt>
      </View>
      {action}
    </View>
  );
}

function SectionRule() {
  const { palette } = useTheme();
  return <View style={{ width: 18, height: 1, backgroundColor: palette.primary, opacity: 0.8 }} />;
}
