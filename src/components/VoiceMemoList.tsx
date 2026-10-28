import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/misc';
import { Txt } from '@/components/Txt';
import { reportedAgo } from '@/lib/hazards';
import { useAuth } from '@/providers/AuthProvider';
import { deleteVoiceMemo, fetchVoiceMemos, signVoiceMemos, type VoiceMemo } from '@/services/voice-memos';
import { useTheme } from '@/theme/ThemeProvider';

function duration(seconds: number | null): string {
  if (!seconds) return '';
  return ` · ${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, '0')}`;
}

/** Team voice memos, newest first, with inline playback. Pass a store id to scope to one store. */
export function VoiceMemoList({ storeId, refreshKey = 0 }: { storeId?: string; refreshKey?: number }) {
  const { palette } = useTheme();
  const { profile } = useAuth();
  const [memos, setMemos] = useState<VoiceMemo[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  const load = useCallback(() => {
    fetchVoiceMemos(storeId)
      .then(setMemos)
      .catch(() => setMemos([]));
  }, [storeId]);

  useEffect(() => load(), [load, refreshKey]);

  // Stop and free the player when the list unmounts.
  useEffect(() => () => player.current?.remove(), []);

  const play = async (memo: VoiceMemo) => {
    try {
      player.current?.remove();
      player.current = null;
      setPlayingId(memo.id);
      const signed = await signVoiceMemos([memo.storage_path]);
      const url = signed[memo.storage_path];
      if (!url) throw new Error('Could not load that memo.');
      const p = createAudioPlayer(url);
      player.current = p;
      p.play();
    } catch (e) {
      setPlayingId(null);
      Alert.alert('Could not play memo', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const stop = () => {
    player.current?.pause();
    setPlayingId(null);
  };

  const remove = (memo: VoiceMemo) => {
    Alert.alert('Delete this memo?', 'It will be removed for the whole team.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (playingId === memo.id) stop();
          deleteVoiceMemo(memo)
            .then(() => setMemos((cur) => (cur ?? []).filter((m) => m.id !== memo.id)))
            .catch((e: unknown) => Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.'));
        },
      },
    ]);
  };

  if (memos === null) return <ActivityIndicator color={palette.primary} style={{ marginVertical: 24 }} />;
  if (memos.length === 0) return <EmptyState icon="mic-outline" title="No memos yet" body="Record a voice note and the whole team can hear it here." />;

  return (
    <View style={{ gap: 10 }}>
      {memos.map((memo, i) => {
        const mine = memo.user_id === profile?.id;
        const playing = playingId === memo.id;
        return (
          <GlassCard key={memo.id} index={i} accessibilityLabel={`Memo from ${mine ? 'you' : 'a teammate'}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={playing ? 'Stop' : 'Play'}
                onPress={() => (playing ? stop() : play(memo))}
                hitSlop={8}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.borderStrong }}
              >
                <Ionicons name={playing ? 'pause' : 'play'} size={20} color={palette.gold} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="strong" numberOfLines={1}>
                  {mine ? 'You' : 'Teammate'}
                  {duration(memo.duration_seconds)}
                </Txt>
                <Txt variant="caption" tone="faint" numberOfLines={1}>
                  {reportedAgo(memo.created_at)}
                  {memo.note ? ` · ${memo.note}` : ''}
                </Txt>
              </View>
              {mine ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Delete memo" onPress={() => remove(memo)} hitSlop={8} style={{ flexShrink: 0 }}>
                  <Ionicons name="trash-outline" size={18} color={palette.textFaint} />
                </Pressable>
              ) : null}
            </View>
          </GlassCard>
        );
      })}
    </View>
  );
}
