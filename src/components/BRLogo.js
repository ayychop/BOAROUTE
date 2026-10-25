import { useEffect, useId } from 'react';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import geo from './br-logo-geometry.json';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const [, , VB_W, VB_H] = geo.viewBox;
export const BR_LOGO_ASPECT = VB_H / VB_W;
const c = geo.colors;
const RIM = `${geo.shieldOuter} ${geo.shieldInner}`;

/**
 * BOAROUTE crest: a slim curved shield in brushed metallic gold with a sharp,
 * minimalist "BR" monogram on deep black. Geometry lives in
 * br-logo-geometry.json so the app icon and splash render from the same shapes.
 *
 * @param {object} props
 * @param {number} [props.size=120] Width in dp. Height follows the crest aspect ratio.
 * @param {boolean} [props.animated=false] Slow light sweep and breathing halo (respects Reduce Motion).
 * @param {boolean} [props.glow=true] Soft gold halo behind the crest.
 * @param {string} [props.accessibilityLabel]
 */
export function BRLogo({ size = 120, animated = false, glow = true, accessibilityLabel = 'BOAROUTE' }) {
  const id = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.5);
  const sweep = useSharedValue(-80);
  // Fine ornaments only where there are enough pixels to draw them crisply.
  const detailed = size >= 56;

  useEffect(() => {
    if (!animated || reduced) return undefined;
    pulse.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
    sweep.set(
      withRepeat(
        withSequence(withTiming(-80, { duration: 0 }), withDelay(900, withTiming(260, { duration: 1700, easing: Easing.inOut(Easing.cubic) }))),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(sweep);
    };
  }, [animated, reduced, pulse, sweep]);

  const haloProps = useAnimatedProps(() => ({ opacity: 0.3 + pulse.get() * 0.4 }));
  const sweepProps = useAnimatedProps(() => ({ x: sweep.get() }));

  const ids = {
    plate: `plate${id}`,
    metal: `metal${id}`,
    letters: `letters${id}`,
    sheen: `sheen${id}`,
    sweep: `sweep${id}`,
    clip: `clip${id}`,
  };
  const hair = detailed ? 0.9 : 1.4;

  return (
    <Svg width={size} height={size * BR_LOGO_ASPECT} viewBox={geo.viewBox.join(' ')} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Defs>
        <RadialGradient id={ids.plate} cx="50%" cy="28%" r="80%">
          <Stop offset="0" stopColor={c.plateTop} />
          <Stop offset="1" stopColor={c.plateBottom} />
        </RadialGradient>
        {/* Brushed metal: alternating light and shadow bands */}
        <LinearGradient id={ids.metal} x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor={c.goldLight} />
          <Stop offset="0.22" stopColor={c.gold} />
          <Stop offset="0.48" stopColor={c.goldMid} />
          <Stop offset="0.66" stopColor={c.goldBright} />
          <Stop offset="1" stopColor={c.goldDeep} />
        </LinearGradient>
        <LinearGradient id={ids.letters} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.goldLight} />
          <Stop offset="0.38" stopColor={c.gold} />
          <Stop offset="0.62" stopColor={c.goldMid} />
          <Stop offset="1" stopColor={c.goldBright} />
        </LinearGradient>
        <LinearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="0.7">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.07" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={ids.sweep} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFF6DD" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <ClipPath id={ids.clip}>
          <Path d={geo.shieldOuter} />
        </ClipPath>
      </Defs>

      {glow && (
        <AnimatedG animatedProps={haloProps} opacity={0.5}>
          <Path d={geo.shieldOuter} fill="none" stroke={c.gold} strokeWidth={14} strokeOpacity={0.1} strokeLinejoin="round" />
          <Path d={geo.shieldOuter} fill="none" stroke={c.gold} strokeWidth={7} strokeOpacity={0.18} strokeLinejoin="round" />
        </AnimatedG>
      )}

      {/* Shield: black plate inside a metallic rim with a fine inner hairline */}
      <Path d={geo.shieldOuter} fill={`url(#${ids.plate})`} />
      <Path d={RIM} fill={`url(#${ids.metal})`} fillRule="evenodd" />
      {detailed && <Path d={geo.shieldHairline} fill="none" stroke={c.gold} strokeOpacity={0.55} strokeWidth={hair} strokeLinejoin="round" />}

      {detailed && (
        <G>
          <Path d={geo.star} fill={`url(#${ids.letters})`} />
          {geo.starRules.map((d) => (
            <Path key={d} d={d} stroke={c.gold} strokeOpacity={0.7} strokeWidth={1.1} strokeLinecap="round" />
          ))}
          <Path d={geo.baseRule} stroke={c.gold} strokeOpacity={0.6} strokeWidth={1.1} strokeLinecap="round" />
          <Path d={geo.baseDiamond} fill={c.gold} fillOpacity={0.85} />
        </G>
      )}

      {/* Monogram */}
      <Path d={geo.letterB} fill={`url(#${ids.letters})`} fillRule="evenodd" />
      <Path d={geo.letterR} fill={`url(#${ids.letters})`} fillRule="evenodd" />
      {detailed && (
        <G>
          <Path d={geo.letterB} fill="none" stroke={c.goldLight} strokeOpacity={0.5} strokeWidth={0.7} strokeLinejoin="miter" fillRule="evenodd" />
          <Path d={geo.letterR} fill="none" stroke={c.goldLight} strokeOpacity={0.5} strokeWidth={0.7} strokeLinejoin="miter" fillRule="evenodd" />
        </G>
      )}

      {/* Glass sheen, plus a slow light sweep when animated */}
      <G clipPath={`url(#${ids.clip})`}>
        <Path d="M14 22 L186 22 L186 90 L14 120 Z" fill={`url(#${ids.sheen})`} />
        {animated && !reduced && (
          <G transform="rotate(22 100 110)">
            <AnimatedRect animatedProps={sweepProps} y={-80} width={44} height={380} fill={`url(#${ids.sweep})`} />
          </G>
        )}
      </G>
    </Svg>
  );
}

export default BRLogo;
