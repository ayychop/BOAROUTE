import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  value: number;
  onChange: (v: number) => void;
  /** Fired once the finger lifts (save, play a sample). */
  onCommit?: (v: number) => void;
  step?: number;
  label: string;
}

const THUMB = 28;

/** 0 to 1 slider: drag or tap anywhere on the track. Screen readers step it with swipe up / down. */
export function Slider({ value, onChange, onCommit, step = 0.05, label }: Props) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);

  const at = (e: GestureResponderEvent) => {
    const raw = width > 0 ? Math.max(0, Math.min(1, e.nativeEvent.locationX / width)) : 0;
    return Math.round(raw / step) * step;
  };

  const onAction = (e: AccessibilityActionEvent) => {
    const delta = e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1;
    const v = Math.max(0, Math.min(1, Math.round((value + delta) * 20) / 20));
    onChange(v);
    onCommit?.(v);
  };

  const x = value * width;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)} percent` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      style={{ height: 44, justifyContent: 'center' }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onChange(at(e));
      }}
      onResponderMove={(e) => {
        const v = at(e);
        if (v !== value) onChange(v);
      }}
      onResponderRelease={(e) => onCommit?.(at(e))}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: palette.border }}>
        <View style={{ height: 6, borderRadius: 3, width: x, backgroundColor: palette.gold }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: Math.max(0, Math.min(width - THUMB, x - THUMB / 2)),
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: palette.gold,
          borderWidth: 3,
          borderColor: palette.surface,
          shadowColor: palette.gold,
          shadowOpacity: 0.5,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        }}
      />
    </View>
  );
}
