import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { on: 'planet', off: 'planet-outline', label: 'Hub' },
  route: { on: 'navigate', off: 'navigate-outline', label: 'Route' },
  stores: { on: 'storefront', off: 'storefront-outline', label: 'Stores' },
  events: { on: 'calendar', off: 'calendar-outline', label: 'Events' },
  finances: { on: 'wallet', off: 'wallet-outline', label: 'Finances' },
  profile: { on: 'person-circle', off: 'person-circle-outline', label: 'Me' },
};

/** On Android the keyboard would push the tab bar up over the form; hide it while typing. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

function NeonTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { palette } = useTheme();
  const keyboardOpen = useKeyboardOpen();
  const { compact, maxContent } = useLayout();
  const [w, setW] = useState(0);
  const count = state.routes.length;
  const seg = w / Math.max(1, count);
  const indicator = useAnimatedStyle(() => ({
    width: Math.max(0, seg - 24),
    transform: [{ translateX: withSpring(state.index * seg + 12, { damping: 18, stiffness: 200 }) }],
  }));
  const showLabels = !compact;

  if (keyboardOpen) return null;

  return (
    <View
      style={{
        backgroundColor: palette.tabBar,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', width: '100%', maxWidth: maxContent, alignSelf: 'center' }}>
        {w > 0 && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                height: 3,
                borderBottomLeftRadius: 3,
                borderBottomRightRadius: 3,
                backgroundColor: palette.primary,
                shadowColor: palette.primary,
                shadowOpacity: palette.phase === 'dawn' ? 0.3 : 1,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
                elevation: 6,
              },
              indicator,
            ]}
          />
        )}
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const meta = ICONS[route.name] ?? { on: 'ellipse', off: 'ellipse-outline', label: descriptors[route.key]?.options.title ?? route.name };
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            Haptics.selectionAsync().catch(() => {});
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: compact ? 10 : 9, paddingBottom: compact ? 4 : 2, minHeight: compact ? 46 : 56 }}
            >
              <Ionicons name={focused ? meta.on : meta.off} size={compact ? 22 : 23} color={focused ? palette.primary : palette.textFaint} />
              {showLabels && (
                <Txt variant="label" tone={focused ? 'primary' : 'faint'} style={{ marginTop: 3, fontSize: 9, letterSpacing: 0.8 }} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                  {meta.label}
                </Txt>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <NeonTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.bg[0] } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hub' }} />
      <Tabs.Screen name="route" options={{ title: 'Route' }} />
      <Tabs.Screen name="stores" options={{ title: 'Stores' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="finances" options={{ title: 'Finances' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
  );
}
