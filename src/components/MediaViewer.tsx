import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isVideoPath } from '@/services/media';

function VideoPlayer({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={{ width, height }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />;
}

/** Full-screen viewer for one task photo or video. */
export function MediaViewer({ path, url, onClose }: { path: string | null; url: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const open = !!path && !!url;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' }}>
        {open &&
          (isVideoPath(path!) ? (
            <VideoPlayer uri={url!} width={width} height={height * 0.8} />
          ) : (
            <Image source={{ uri: url! }} style={{ width, height: height * 0.85 }} contentFit="contain" transition={200} />
          ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={12}
          style={{ position: 'absolute', top: insets.top + 12, right: insets.right + 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}
