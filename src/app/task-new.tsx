import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Field, ProgressBar, Segmented } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { supabase } from '@/lib/supabaseClient';
import type { TaskType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { MAX_ATTACHMENTS, captureWithCamera, deleteMedia, pickFromLibrary, uploadTaskMedia, type PickedMedia } from '@/services/media';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

export default function NewTask() {
  const { storeId, title: initialTitle, content: initialContent, type: initialType } = useLocalSearchParams<{ storeId?: string; title?: string; content?: string; type?: TaskType }>();
  const { palette } = useTheme();
  const { session } = useAuth();
  const { stores } = useData();
  const store = stores.find((s) => s.id === storeId);

  const [title, setTitle] = useState(initialTitle ?? '');
  const [content, setContent] = useState(initialContent ?? '');
  const [type, setType] = useState<TaskType>(initialType === 'email' ? 'email' : 'note');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const room = MAX_ATTACHMENTS - media.length;

  const add = async (source: 'library' | 'camera') => {
    try {
      const picked = source === 'library' ? await pickFromLibrary(room) : await captureWithCamera();
      setMedia((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
    } catch (e) {
      Alert.alert('Could not add media', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError('Give the task a name.');
    if (!session) return;
    setBusy(true);
    let paths: string[] = [];
    try {
      if (media.length) {
        setProgress(0);
        paths = await uploadTaskMedia(session.user.id, media, (done, total) => setProgress(done / total));
      }
      const { error: err } = await supabase.from('tasks').insert({
        store_id: storeId ?? null,
        title: title.trim().slice(0, 200),
        content: content.trim(),
        media_urls: paths,
        task_type: type,
      });
      if (err) throw err;
      router.back();
    } catch (e) {
      if (paths.length) await deleteMedia(paths).catch(() => {});
      setError(e instanceof Error ? e.message : 'Could not save the task.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Screen back kicker={store ? store.name : 'Smart task'} title="New task">
      <GlassCard glow="primary">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'note', label: 'Note', icon: 'document-text' },
            { value: 'email', label: 'Email', icon: 'mail' },
          ]}
          style={{ marginBottom: 16 }}
        />
        <Field label="Task name" icon="pricetag-outline" value={title} onChangeText={setTitle} placeholder="e.g. Promo stock count" maxLength={200} returnKeyType="next" />
        <Field label="Details" value={content} onChangeText={setContent} multiline placeholder="Numbers, findings, follow-ups..." />

        <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
          Photos and videos ({media.length}/{MAX_ATTACHMENTS})
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {media.map((m, i) => (
            <Animated.View key={`${m.uri}-${i}`} entering={ZoomIn.springify()} exiting={ZoomOut.duration(150)}>
              <View style={{ width: 86, height: 86, borderRadius: radius.md, overflow: 'hidden', backgroundColor: palette.surfaceStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border }}>
                {m.kind === 'image' ? <Image source={{ uri: m.uri }} style={{ width: 86, height: 86 }} contentFit="cover" /> : <Ionicons name="videocam" size={30} color={palette.primary} />}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
                onPress={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                hitSlop={8}
                style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={15} color="#fff" />
              </Pressable>
            </Animated.View>
          ))}
        </View>
        {room > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <NeonButton size="sm" variant="subtle" icon="images" label="Gallery" onPress={() => add('library')} disabled={busy} />
            <NeonButton size="sm" variant="subtle" icon="camera" label="Camera" onPress={() => add('camera')} disabled={busy} />
          </View>
        )}

        {progress !== null && (
          <View style={{ marginBottom: 12, gap: 6 }}>
            <Txt variant="caption" tone="dim">
              Uploading {Math.round(progress * 100)}%
            </Txt>
            <ProgressBar value={progress} />
          </View>
        )}
        {error ? (
          <Txt variant="caption" tone="danger" style={{ marginBottom: 12 }}>
            {error}
          </Txt>
        ) : null}
        <NeonButton label="Save task" icon="cloud-upload" onPress={save} loading={busy} size="lg" full />
        <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 10 }}>
          Saved to your BOAROUTE account, so it survives cache clears and new phones.
        </Txt>
      </GlassCard>
    </Screen>
  );
}
