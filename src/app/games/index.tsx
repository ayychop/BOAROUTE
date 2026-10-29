import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRLogo } from '@/components/BRLogo';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { CURATED_GAMES, type Game } from '@/lib/games';
import { getPref, setPref } from '@/lib/prefs';
import { fetchDiscover, importGame, loadLibrary, loadRecent, removeGame, type DiscoverPage } from '@/services/game-library';
import { isHazardWatchRunning, stopHazardWatch } from '@/services/hazard-watch';

const GOLD = '#E8CF94';
const INK = 'rgba(245,240,230,0.94)';
const DIM = 'rgba(245,240,230,0.6)';
const UPSCALE_PREF = 'games.upscale';
const UPLOAD_ID = '__upload__';
const MORE_ID = '__more__';

type Tab = 'library' | 'discover';
type Tile = Game | { id: typeof UPLOAD_ID | typeof MORE_ID };

/** A colour per game so the backdrop shifts as you move along the row, like the console home screen. */
const ACCENTS = ['#1B3A8A', '#6B1F7A', '#0F6B5C', '#8A3B12', '#2A5D9F', '#7A1F3D', '#3C6E1F', '#5B2A8A'];
function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

function dedupe(list: Game[]): Game[] {
  const seen = new Set<string>();
  return list.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
}

const GameTile = memo(function GameTile({
  tile,
  index,
  size,
  step,
  scrollX,
  focused,
  onPress,
}: {
  tile: Tile;
  index: number;
  size: number;
  step: number;
  scrollX: SharedValue<number>;
  focused: boolean;
  onPress: (index: number) => void;
}) {
  const press = useSharedValue(1);
  const style = useAnimatedStyle(() => {
    const x = scrollX.get();
    const at = [(index - 1) * step, index * step, (index + 1) * step];
    return {
      transform: [{ scale: interpolate(x, at, [0.82, 1.06, 0.82], Extrapolation.CLAMP) * press.get() }],
      opacity: interpolate(x, at, [0.55, 1, 0.55], Extrapolation.CLAMP),
    };
  });
  const art = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(scrollX.get(), [(index - 1) * step, (index + 1) * step], [size * 0.12, -size * 0.12], Extrapolation.CLAMP) }, { scale: 1.3 }],
  }));
  const isGame = 'url' in tile;
  const label = isGame ? tile.title : tile.id === UPLOAD_ID ? 'Upload a game' : 'Load more';
  return (
    <Pressable
      onPress={() => onPress(index)}
      onPressIn={() => press.set(withSpring(0.94, { damping: 18, stiffness: 320 }))}
      onPressOut={() => press.set(withSpring(1, { damping: 12, stiffness: 260 }))}
      accessibilityRole="button"
      accessibilityLabel={focused && isGame ? `${label}. Double tap to play` : label}
      accessibilityState={{ selected: focused }}
      style={{ width: step, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: 22, overflow: 'hidden', backgroundColor: isGame ? accentFor(tile.id) : 'rgba(255,255,255,0.08)' },
          focused && { borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#FFFFFF', shadowOpacity: 0.5, shadowRadius: 16, elevation: 14 },
          style,
        ]}
      >
        {isGame && tile.thumb ? (
          <Animated.View style={[StyleSheet.absoluteFill, art]}>
            <Image source={tile.thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" recyclingKey={tile.id} />
          </Animated.View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 12 }]}>
            <Ionicons name={!isGame ? (tile.id === UPLOAD_ID ? 'add-circle' : 'refresh-circle') : tile.source === 'local' ? 'document-text' : 'game-controller'} size={size * 0.34} color={INK} />
            <Txt variant="strong" align="center" numberOfLines={2} style={{ color: INK, marginTop: 6, fontSize: 13 }}>
              {label}
            </Txt>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

/**
 * Game Hub: a console-style launcher. The row of tiles scales and parallaxes on
 * the UI thread as it scrolls, the backdrop takes the focused game's art and
 * colour, and tapping the focused tile launches it full screen.
 */
export default function GameHub() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const landscape = width > height;
  const size = Math.round(Math.min(landscape ? height * 0.34 : width * 0.36, 190));
  const step = size + 18;
  const side = Math.max(0, (width - step) / 2);

  const [tab, setTab] = useState<Tab>('library');
  const [library, setLibrary] = useState<Game[]>(loadLibrary);
  const [recent, setRecent] = useState<Game[]>(loadRecent);
  const [discover, setDiscover] = useState<DiscoverPage | null>(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focus, setFocus] = useState(0);
  const [upscale, setUpscale] = useState(getPref(UPSCALE_PREF) !== '0');
  const [importing, setImporting] = useState(false);
  const listRef = useRef<Animated.FlatList<Tile>>(null);
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const scrollX = useSharedValue(0);
  const lastFocus = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      setLibrary(loadLibrary());
      setRecent(loadRecent());
    }, []),
  );

  useEffect(() => {
    if (tab !== 'discover' || discover) return;
    const ctrl = new AbortController();
    fetchDiscover(1, ctrl.signal).then((d) => {
      if (!ctrl.signal.aborted) setDiscover(d);
    });
    return () => ctrl.abort();
  }, [tab, discover]);

  const tiles = useMemo<Tile[]>(() => {
    if (tab === 'library') return [{ id: UPLOAD_ID }, ...dedupe([...recent, ...library, ...CURATED_GAMES])];
    if (!discover) return [];
    return discover.offline ? discover.games : [...discover.games, { id: MORE_ID }];
  }, [tab, recent, library, discover]);

  const focused = tiles[Math.min(focus, Math.max(0, tiles.length - 1))];
  const focusedGame = focused && 'url' in focused ? focused : null;

  const onFocusChange = useCallback((i: number) => {
    setFocus(i);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
    const i = Math.max(0, Math.round(e.contentOffset.x / step));
    if (i !== lastFocus.get()) {
      lastFocus.set(i);
      runOnJS(onFocusChange)(i);
    }
  });

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTab(t);
    setFocus(0);
    lastFocus.set(0);
    scrollX.set(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const play = useCallback(
    (game: Game) => {
      const go = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.push({ pathname: '/games/play', params: { id: game.id, url: game.url, title: game.title, orientation: game.orientation, source: game.source, upscale: upscale ? '1' : '0' } });
      };
      if (!isHazardWatchRunning()) return go();
      Alert.alert('Drive alerts are on', 'Games stay locked while speed camera and police alerts are running. Only play when you are parked.', [
        { text: 'Cancel', style: 'cancel' },
        { text: "I'm parked, stop alerts", style: 'destructive', onPress: () => stopHazardWatch().finally(go) },
      ]);
    },
    [upscale],
  );

  const upload = async () => {
    setImporting(true);
    const res = await importGame().finally(() => setImporting(false));
    if (res.ok) {
      setLibrary(loadLibrary());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      play(res.game);
    } else if (res.reason !== 'canceled') {
      Alert.alert(
        'Could not add that game',
        res.reason === 'not-html'
          ? 'Pick a single .html file. Games that need a folder of extra files will not run on their own.'
          : res.reason === 'too-big'
            ? 'That file is over 50 MB.'
            : (res.message ?? 'Please try again.'),
      );
    }
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const next = await fetchDiscover(page + 1);
    setLoadingMore(false);
    if (!next.games.length) return;
    setPage(page + 1);
    setDiscover((d) => (d ? { ...d, games: dedupe([...d.games, ...next.games]) } : next));
  };

  const onTilePress = useCallback(
    (i: number) => {
      const t = tiles[i];
      if (!t) return;
      if (i !== focus) {
        listRef.current?.scrollToOffset({ offset: i * step, animated: !reduceMotion });
        return;
      }
      if (t.id === UPLOAD_ID) upload();
      else if (t.id === MORE_ID) loadMore();
      else if ('url' in t) play(t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, focus, step, reduceMotion, play],
  );

  const backdrop = useAnimatedStyle(() => ({
    transform: [{ translateX: reduceMotion ? 0 : -((scrollX.get() * 0.06) % (width * 0.2)) }, { scale: 1.25 }],
  }));

  const accent = focusedGame ? accentFor(focusedGame.id) : '#1A1B1E';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
        <Animated.View key={focused?.id ?? 'none'} entering={FadeIn.duration(260)} exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, backdrop]}>
          <LinearGradient colors={[accent, '#05060A']} start={{ x: 0.1, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          {focusedGame?.thumb ? <Image source={focusedGame.thumb} style={[StyleSheet.absoluteFill, { opacity: 0.38 }]} contentFit="cover" blurRadius={6} cachePolicy="memory-disk" /> : null}
        </Animated.View>
        <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', '#000']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

        <View style={{ flex: 1, paddingTop: insets.top + 76, paddingBottom: insets.bottom + 12 }}>
          {tab === 'discover' && !discover ? (
            <View style={{ height: size + 40, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={GOLD} size="large" />
              <Txt variant="caption" style={{ color: DIM, marginTop: 10 }}>
                Finding games
              </Txt>
            </View>
          ) : (
            <Animated.FlatList
              ref={listRef}
              data={tiles}
              horizontal
              keyExtractor={(t) => t.id}
              renderItem={({ item, index }) => <GameTile tile={item} index={index} size={size} step={step} scrollX={scrollX} focused={index === focus} onPress={onTilePress} />}
              extraData={focus}
              showsHorizontalScrollIndicator={false}
              snapToInterval={step}
              decelerationRate="fast"
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: side, height: size + 40, alignItems: 'center' }}
              getItemLayout={(_, i) => ({ length: step, offset: step * i, index: i })}
              initialNumToRender={8}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              style={{ flexGrow: 0 }}
            />
          )}

          <Animated.View key={`info-${focused?.id ?? 'none'}`} entering={FadeIn.duration(220)} style={{ paddingHorizontal: 28, marginTop: 8, maxWidth: 720 }}>
            {tab === 'discover' && discover?.offline ? (
              <Txt variant="caption" style={{ color: '#F2B36B', marginBottom: 8 }}>
                Can&apos;t reach the game feed right now, so here are saved and built-in games.
              </Txt>
            ) : null}
            {focusedGame ? (
              <>
                <Txt variant="label" style={{ color: GOLD }}>
                  {focusedGame.category} · {focusedGame.source === 'local' ? 'On this phone' : 'Online'}
                </Txt>
                <Txt variant="display" numberOfLines={1} style={{ color: INK, marginTop: 4 }}>
                  {focusedGame.title}
                </Txt>
                {focusedGame.description ? (
                  <Txt variant="caption" numberOfLines={3} style={{ color: DIM, marginTop: 4 }}>
                    {focusedGame.description}
                  </Txt>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <NeonButton label="Play" icon="play" size="lg" onPress={() => play(focusedGame)} onDark style={{ minWidth: 160 }} />
                  {focusedGame.source === 'local' && (
                    <NeonButton
                      label="Remove"
                      icon="trash-outline"
                      variant="subtle"
                      onDark
                      onPress={() =>
                        Alert.alert('Remove game?', `${focusedGame.title} will be deleted from this phone.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => setLibrary(removeGame(focusedGame.id)) },
                        ])
                      }
                    />
                  )}
                </View>
              </>
            ) : focused?.id === UPLOAD_ID ? (
              <>
                <Txt variant="display" style={{ color: INK }}>
                  Add your own game
                </Txt>
                <Txt variant="caption" style={{ color: DIM, marginTop: 4 }}>
                  Pick a single-file HTML5 game from your phone or Drive. It is kept in the app so it plays offline.
                </Txt>
                <NeonButton label={importing ? 'Adding' : 'Choose HTML file'} icon="cloud-upload" size="lg" loading={importing} onPress={upload} onDark style={{ marginTop: 16, alignSelf: 'flex-start' }} />
              </>
            ) : focused?.id === MORE_ID ? (
              <NeonButton label="Load more games" icon="refresh" size="lg" loading={loadingMore} onPress={loadMore} onDark style={{ alignSelf: 'flex-start' }} />
            ) : null}
            <Pressable
              onPress={() => {
                const next = !upscale;
                setUpscale(next);
                setPref(UPSCALE_PREF, next ? '1' : '0');
                Haptics.selectionAsync().catch(() => {});
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: upscale }}
              accessibilityHint="Renders games at 720p and sharpens them up to your screen's resolution"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, alignSelf: 'flex-start', paddingVertical: 6 }}
            >
              <Ionicons name={upscale ? 'sparkles' : 'sparkles-outline'} size={18} color={upscale ? GOLD : DIM} />
              <Txt variant="caption" style={{ color: upscale ? GOLD : DIM }}>
                BR Upscaler {upscale ? 'on · 720p to native, sharpened' : 'off · native rendering'}
              </Txt>
            </Pressable>
          </Animated.View>
        </View>
      </BlurTargetView>

      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={45}
        tint="dark"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <BRLogo size={30} animated={!reduceMotion} glow />
        <View style={{ flexDirection: 'row', gap: 6, flex: 1 }} accessibilityRole="tablist">
          {(['library', 'discover'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => switchTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: tab === t ? 'rgba(255,255,255,0.16)' : 'transparent' }}
            >
              <Txt variant="strong" style={{ color: tab === t ? INK : DIM }}>
                {t === 'library' ? 'Library' : 'Discover'}
              </Txt>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close Game Hub" style={{ padding: 6 }}>
          <Ionicons name="close" size={26} color={INK} />
        </Pressable>
      </BlurView>
    </View>
  );
}
