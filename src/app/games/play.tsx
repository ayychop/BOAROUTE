import { Ionicons } from '@expo/vector-icons';
import { Directory, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, AppState, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as BaseWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { allowGameNavigation, buildEnhancerScript, parseGameMessage, type Game, type GameOrientation } from '@/lib/games';
import { recordPlayed } from '@/services/game-library';

const INK = 'rgba(245,240,230,0.94)';
const DIM = 'rgba(245,240,230,0.6)';
const GOLD = '#E8CF94';
/** No heartbeat for this long while on screen means the game's page has hung. */
const HANG_MS = 12_000;

type Crash = { kind: 'crashed' | 'hung' | 'failed'; detail?: string };

/** The package's shared typings omit the ref the Android and iOS components forward. */
type WebViewHandle = { requestFocus: () => void };
const WebView = BaseWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/** Keeps a render error in the game screen from reaching the rest of the app. */
class GameBoundary extends Component<{ children: ReactNode; onCrash: (detail: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onCrash(error instanceof Error ? error.message : 'Unknown error');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function safeGameUrl(url: string | undefined, source: string | undefined): string | null {
  if (!url) return null;
  if (source === 'local') {
    const root = new Directory(Paths.document, 'games').uri;
    return url.startsWith(root) && !url.includes('..') ? url : null;
  }
  return url.startsWith('https://') ? url : null;
}

export default function PlayGame() {
  useKeepAwake('game');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; url: string; title?: string; orientation?: GameOrientation; source?: string; upscale?: string }>();
  const url = safeGameUrl(params.url, params.source);
  const local = params.source === 'local';
  const upscale = params.upscale !== '0';
  const script = useMemo(() => buildEnhancerScript({ upscale }), [upscale]);

  const webRef = useRef<WebViewHandle>(null);
  const lastBeat = useRef(0);
  const sawGameFrame = useRef(false);
  const [session, setSession] = useState(0);
  const [loading, setLoading] = useState(true);
  const [crash, setCrash] = useState<Crash | null>(null);
  const [menu, setMenu] = useState(false);
  const [fps, setFps] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const [enhanceNote, setEnhanceNote] = useState<string | null>(null);
  const [pad, setPad] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !params.id) return;
    const game: Game = {
      id: params.id,
      title: params.title || 'Game',
      url,
      thumb: null,
      description: '',
      category: local ? 'My games' : 'Online',
      source: local ? 'local' : 'web',
      orientation: params.orientation ?? 'any',
    };
    recordPlayed(game);
  }, [url, params.id, params.title, params.orientation, local]);

  // Watchdog: only while the game is on screen and loaded, so backgrounding never counts as a hang.
  useEffect(() => {
    if (crash || loading) return;
    lastBeat.current = Date.now();
    let active = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (s) => {
      active = s === 'active';
      lastBeat.current = Date.now();
    });
    const t = setInterval(() => {
      if (active && Date.now() - lastBeat.current > HANG_MS) setCrash({ kind: 'hung' });
    }, 3000);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [crash, loading, session]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenu((m) => !m);
      return true;
    });
    return () => sub.remove();
  }, []);

  const reload = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCrash(null);
    setMenu(false);
    setLoading(true);
    setEnhanced(false);
    sawGameFrame.current = false;
    // A fresh key throws the old WebView (and any dead render process) away.
    setSession((s) => s + 1);
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const m = parseGameMessage(e.nativeEvent.data);
    if (!m) return;
    lastBeat.current = Date.now();
    if (m.t === 'beat') {
      // With the game in an iframe, the page itself also beats: once the game frame has reported, only it counts.
      if (m.game) sawGameFrame.current = true;
      if (m.game || !sawGameFrame.current) {
        setFps(m.fps);
        setEnhanced(m.enh);
      }
    } else if (m.t === 'enh') {
      setEnhanced(m.on);
      if (!m.on && m.why) setEnhanceNote(m.why);
    } else if (m.t === 'pad') {
      setPad(m.on ? m.id : null);
      if (m.on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => (url ? allowGameNavigation(url, req.url, req.isTopFrame ?? true) : false), [url]);

  if (!url) {
    return (
      <View style={[styles.fill, styles.center, { padding: 24 }]}>
        <StatusBar hidden />
        <Txt variant="title" style={{ color: INK }} align="center">
          This game can&apos;t be opened
        </Txt>
        <Txt variant="caption" style={{ color: DIM, marginTop: 8 }} align="center">
          Only games from the Hub or files you uploaded can be played.
        </Txt>
        <NeonButton label="Back to Game Hub" icon="arrow-back" onPress={() => router.back()} onDark style={{ marginTop: 18 }} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <StatusBar hidden />
      {!crash && (
        <GameBoundary key={`b-${session}`} onCrash={(detail) => setCrash({ kind: 'crashed', detail })}>
          <WebView
            key={`w-${session}`}
            ref={webRef}
            source={{ uri: url }}
            style={styles.fill}
            containerStyle={styles.fill}
            originWhitelist={local ? ['file://*'] : ['https://*']}
            injectedJavaScriptBeforeContentLoaded={script}
            // Online games often run inside an iframe, so the upscaler goes into every frame; uploads are one page.
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly={local}
            onShouldStartLoadWithRequest={onShouldStart}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowFileAccess={local}
            allowFileAccessFromFileURLs={local}
            allowingReadAccessToURL={local ? new Directory(Paths.document, 'games').uri : undefined}
            androidLayerType="hardware"
            overScrollMode="never"
            bounces={false}
            scrollEnabled={false}
            pullToRefreshEnabled={false}
            allowsBackForwardNavigationGestures={false}
            webviewDebuggingEnabled={__DEV__}
            onMessage={onMessage}
            onLoadEnd={() => {
              setLoading(false);
              // Gamepad and keyboard events go to the focused view.
              webRef.current?.requestFocus();
            }}
            onError={(e) => setCrash({ kind: 'failed', detail: e.nativeEvent.description })}
            onRenderProcessGone={(e) => setCrash({ kind: 'crashed', detail: e.nativeEvent.didCrash ? 'The game ran out of memory or crashed.' : 'Android closed the game to free memory.' })}
            onContentProcessDidTerminate={() => setCrash({ kind: 'crashed', detail: 'iOS closed the game to free memory.' })}
          />
        </GameBoundary>
      )}

      {loading && !crash && (
        <Animated.View exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#000' }]} pointerEvents="none">
          <ActivityIndicator size="large" color={GOLD} />
          <Txt variant="caption" style={{ color: DIM, marginTop: 10 }}>
            Loading {params.title ?? 'game'}
          </Txt>
        </Animated.View>
      )}

      {!crash && (
        <Pressable
          onPress={() => setMenu(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Game menu"
          style={[styles.menuButton, { top: insets.top + 8, left: insets.left + 8 }]}
        >
          <Ionicons name="pause" size={18} color={INK} />
        </Pressable>
      )}

      {(menu || crash) && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.82)', padding: 24 }]}>
          <View style={{ maxWidth: 420, width: '100%', alignItems: 'center' }}>
            <Ionicons name={crash ? 'warning' : 'game-controller'} size={40} color={crash ? '#F2B36B' : GOLD} />
            <Txt variant="title" align="center" style={{ color: INK, marginTop: 10 }}>
              {crash ? (crash.kind === 'hung' ? 'The game stopped responding' : crash.kind === 'failed' ? "The game didn't load" : 'The game crashed') : (params.title ?? 'Paused')}
            </Txt>
            <Txt variant="caption" align="center" style={{ color: DIM, marginTop: 6 }}>
              {crash
                ? `${crash.detail ? `${crash.detail} ` : ''}BOAROUTE is fine, and your visits and timers are untouched.`
                : `${fps ? `${fps} fps · ` : ''}${enhanced ? 'BR Upscaler on' : upscale ? (enhanceNote ?? 'Upscaler not needed for this game') : 'Upscaler off'}${pad ? ` · ${pad.split('(')[0].trim()}` : ''}`}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
              {!crash && <NeonButton label="Resume" icon="play" onPress={() => setMenu(false)} onDark />}
              <NeonButton label={crash ? 'Try again' : 'Restart'} icon="refresh" variant={crash ? 'gold' : 'subtle'} onPress={reload} onDark />
              <NeonButton label="Quit" icon="exit-outline" variant="subtle" onPress={() => router.back()} onDark />
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  menuButton: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
