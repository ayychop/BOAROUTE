import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/providers/AuthProvider';
import {
  addOrderItem,
  closeOrder,
  fetchOpenOrder,
  fetchOrderItems,
  removeOrderItem,
  startOrder,
  type TeamOrder,
  type TeamOrderItem,
} from '@/services/team-orders';
import { useTheme } from '@/theme/ThemeProvider';

const SPOTS = ['Greggs', "Nando's", 'Tesco Meal Deal', 'Nap'];

/** Lunch hub: a shared group order plus a spin-the-wheel picker. */
export default function Lunch() {
  const { palette } = useTheme();
  const { profile, isAdmin } = useAuth();
  const [order, setOrder] = useState<TeamOrder | null>(null);
  const [items, setItems] = useState<TeamOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');

  const load = useCallback(
    () =>
      fetchOpenOrder()
        .catch(() => null)
        .then(async (open) => {
          const next = open ? await fetchOrderItems(open.id).catch(() => []) : [];
          setOrder(open);
          setItems(next);
          setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: anyone adding an item or closing the order refreshes everyone.
  useEffect(() => {
    const channel = supabase
      .channel('lunch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_order_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_orders' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const start = async (place: string | null) => {
    setBusy(true);
    try {
      const created = await startOrder('Lunch', place);
      setOrder(created);
      setItems([]);
    } catch (e) {
      Alert.alert('Could not start the order', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const value = text.trim();
    if (!value || !order) return;
    setText('');
    try {
      const saved = await addOrderItem(order.id, value, null);
      setItems((cur) => (cur.some((i) => i.id === saved.id) ? cur : [...cur, saved]));
      Haptics.selectionAsync().catch(() => {});
    } catch (e) {
      setText(value);
      Alert.alert('Could not add that', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const close = () => {
    if (!order) return;
    Alert.alert('Close this order?', 'Nobody will be able to add more items.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close order',
        style: 'destructive',
        onPress: () => closeOrder(order.id).then(load).catch((e: unknown) => Alert.alert('Could not close', e instanceof Error ? e.message : 'Please try again.')),
      },
    ]);
  };

  const canClose = !!order && (order.created_by === profile?.id || isAdmin);

  return (
    <Screen kicker="Team" title="Lunch" back>
      <SectionHeader title="Spin the wheel" />
      <SpinWheel onStartHere={order ? undefined : (place) => start(place)} />

      <SectionHeader title={order ? `Group order${order.place ? ` · ${order.place}` : ''}` : 'Group order'} />
      {loading ? (
        <ActivityIndicator color={palette.primary} style={{ marginVertical: 24 }} />
      ) : !order ? (
        <EmptyState
          icon="fast-food-outline"
          title="No order running"
          body="Start a group order and the team can add what they want from their phones."
          action={<NeonButton size="sm" label="Start lunch order" icon="add" loading={busy} onPress={() => start(null)} />}
        />
      ) : (
        <GlassCard animateIn={false}>
          {items.length === 0 ? (
            <Txt variant="caption" tone="faint" style={{ paddingVertical: 8 }}>
              No items yet. Add the first one.
            </Txt>
          ) : (
            items.map((it, i) => {
              const mine = it.user_id === profile?.id;
              return (
                <View
                  key={it.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: palette.border }}
                >
                  <Ionicons name="restaurant-outline" size={16} color={palette.gold} style={{ flexShrink: 0 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="strong" numberOfLines={2}>
                      {it.item}
                    </Txt>
                    <Txt variant="caption" tone="faint" numberOfLines={1}>
                      {mine ? 'You' : 'Teammate'}
                    </Txt>
                  </View>
                  {mine ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove item" hitSlop={8} onPress={() => removeOrderItem(it.id).then(load).catch(() => {})} style={{ flexShrink: 0 }}>
                      <Ionicons name="close-circle-outline" size={18} color={palette.textFaint} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}

          <View style={{ marginTop: 14 }}>
            <Field label="Your order" icon="add" value={text} onChangeText={setText} placeholder="Sausage roll + latte" returnKeyType="done" onSubmitEditing={add} />
            <NeonButton label="Add to order" icon="add" onPress={add} disabled={!text.trim()} full />
          </View>

          {canClose ? <NeonButton label="Close order" icon="checkmark-done" variant="ghost" onPress={close} full style={{ marginTop: 12 }} /> : null}
        </GlassCard>
      )}
    </Screen>
  );
}

/** Cycles through the lunch spots and lands on one at random. */
function SpinWheel({ onStartHere }: { onStartHere?: (place: string) => void }) {
  const { palette } = useTheme();
  const [index, setIndex] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    let ticks = 0;
    const total = 18 + Math.floor(Math.random() * SPOTS.length);
    timer.current = setInterval(() => {
      ticks += 1;
      setIndex((i) => ((i ?? -1) + 1) % SPOTS.length);
      Haptics.selectionAsync().catch(() => {});
      if (ticks >= total) {
        if (timer.current) clearInterval(timer.current);
        setSpinning(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }, 90);
  };

  const picked = index === null ? null : SPOTS[index];

  return (
    <GlassCard glow="gold" animateIn={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {SPOTS.map((spot, i) => {
          const active = i === index;
          return (
            <View
              key={spot}
              style={{
                flexGrow: 1,
                flexBasis: 120,
                minWidth: 0,
                alignItems: 'center',
                paddingVertical: 14,
                borderRadius: 14,
                borderWidth: active ? 1.5 : StyleSheet.hairlineWidth * 2,
                borderColor: active ? palette.gold : palette.border,
                backgroundColor: active ? palette.surfaceStrong : palette.surface,
              }}
            >
              <Txt variant="strong" tone={active ? 'primary' : 'default'} numberOfLines={1}>
                {spot}
              </Txt>
            </View>
          );
        })}
      </View>
      <NeonButton label={spinning ? 'Spinning…' : picked ? `Spin again (${picked})` : 'Spin the wheel'} icon="sync" loading={spinning} onPress={spin} full />
      {picked && !spinning && onStartHere ? (
        <NeonButton label={picked === 'Nap' ? 'No lunch today' : `Start an order for ${picked}`} icon="fast-food" variant="ghost" onPress={() => picked !== 'Nap' && onStartHere(picked)} disabled={picked === 'Nap'} full style={{ marginTop: 10 }} />
      ) : null}
    </GlassCard>
  );
}
