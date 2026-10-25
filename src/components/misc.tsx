import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = 'primary',
  index,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'gold' | 'success' | 'danger';
  index?: number;
  onPress?: () => void;
}) {
  const { palette } = useTheme();
  const color = { primary: palette.primary, gold: palette.gold, success: palette.success, danger: palette.danger }[tone];
  return (
    <GlassCard index={index} onPress={onPress} style={{ flex: 1, minWidth: 140 }} accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name={icon} size={16} color={color} />
        <Txt variant="label" tone="dim" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Txt>
      </View>
      <Txt variant="metric" style={{ color }} glow numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      {sub ? (
        <Txt variant="caption" tone="faint" numberOfLines={2}>
          {sub}
        </Txt>
      ) : null}
    </GlassCard>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <GlassCard style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: palette.borderStrong,
          marginBottom: 4,
        }}
      >
        <Ionicons name={icon} size={26} color={palette.primary} />
      </View>
      <Txt variant="title" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" tone="dim" align="center" style={{ maxWidth: 360 }}>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </GlassCard>
  );
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }} accessibilityLabel={label}>
      <ActivityIndicator color={palette.primary} size="large" />
      <Txt variant="label" tone="dim">
        {label}
      </Txt>
    </View>
  );
}

/** Wraps children into a responsive grid using flex-wrap. */
export function Grid({ children, gap = 12, min = 260 }: { children: ReactNode; gap?: number; min?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{wrapCells(children, min)}</View>;
}

function wrapCells(children: ReactNode, min: number) {
  const items = Array.isArray(children) ? children : [children];
  return items.filter(Boolean).map((child, i) => (
    <View key={i} style={{ flexGrow: 1, flexBasis: min, minWidth: 0 }}>
      {child}
    </View>
  ));
}

/** Shown when the last data load failed, with a one-tap retry. Renders nothing when all is well. */
export function DataErrorBanner() {
  const { palette } = useTheme();
  const { error, refresh } = useData();
  const [retrying, setRetrying] = useState(false);
  if (!error) return null;
  const retry = async () => {
    setRetrying(true);
    await refresh().catch(() => {});
    setRetrying(false);
  };
  return (
    <GlassCard style={{ marginBottom: 12, borderColor: palette.danger }} animateIn={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="cloud-offline-outline" size={20} color={palette.danger} style={{ flexShrink: 0 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="strong" numberOfLines={1}>
            Some data could not load
          </Txt>
          <Txt variant="caption" tone="faint" numberOfLines={2}>
            Check your signal. {error}
          </Txt>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading" onPress={retry} disabled={retrying} hitSlop={10} style={{ flexShrink: 0 }}>
          {retrying ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Txt variant="label" tone="primary">
              Retry
            </Txt>
          )}
        </Pressable>
      </View>
    </GlassCard>
  );
}
