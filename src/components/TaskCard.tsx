import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { formatDateTime } from '@/lib/format';
import type { Task } from '@/lib/types';
import { isVideoPath } from '@/services/media';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { GlassCard } from './GlassCard';
import { IconButton } from './NeonButton';
import { Txt } from './Txt';

interface Props {
  task: Task;
  urls: Record<string, string>;
  index: number;
  onOpenMedia: (path: string) => void;
  onDelete: () => void;
}

export function TaskCard({ task, urls, index, onOpenMedia, onDelete }: Props) {
  const { palette } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const email = task.task_type === 'email';

  return (
    <GlassCard index={index} glow={email ? 'gold' : false} onPress={() => setExpanded((v) => !v)} accessibilityLabel={`${email ? 'Email' : 'Note'}: ${task.title}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Ionicons name={email ? 'mail' : 'document-text'} size={20} color={email ? palette.gold : palette.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="strong" numberOfLines={expanded ? undefined : 1}>
            {task.title}
          </Txt>
          <Txt variant="caption" tone="faint">
            {formatDateTime(new Date(task.created_at))} · {email ? 'Email' : 'Note'}
            {task.media_urls.length ? ` · ${task.media_urls.length} attachment${task.media_urls.length > 1 ? 's' : ''}` : ''}
          </Txt>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textFaint} />
      </View>

      {task.content ? (
        <Txt variant="body" tone="dim" style={{ marginTop: 8 }} numberOfLines={expanded ? undefined : 3} selectable={expanded}>
          {task.content}
        </Txt>
      ) : null}

      {task.media_urls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
          {task.media_urls.map((path) => {
            const url = urls[path];
            const video = isVideoPath(path);
            return (
              <Pressable key={path} onPress={() => onOpenMedia(path)} accessibilityRole="imagebutton" accessibilityLabel={video ? 'Play video' : 'Open photo'}>
                <View style={{ width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden', backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
                  {url && !video ? <Image source={{ uri: url }} style={{ width: 84, height: 84 }} contentFit="cover" transition={200} /> : null}
                  {video && <Ionicons name="play-circle" size={36} color={palette.primary} />}
                  {!url && !video && <Ionicons name="image-outline" size={26} color={palette.textFaint} />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {expanded && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <IconButton
            icon={copied ? 'checkmark' : 'copy-outline'}
            label="Copy text"
            tone="primary"
            onPress={async () => {
              await Clipboard.setStringAsync(task.content ? `${task.title}\n\n${task.content}` : task.title);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
          <IconButton icon="trash-outline" label="Delete task" tone="danger" onPress={onDelete} />
        </View>
      )}
    </GlassCard>
  );
}
