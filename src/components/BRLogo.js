import { useEffect, useId } from 'react';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import geo from './br-logo-geometry.json';

const AnimatedG = Animated.createAnimatedComponent(G);
const [, , VB_W, VB_H] = geo.viewBox;
export const BR_LOGO_ASPECT = VB_H / VB_W;
const c = geo.colors;

/**
 * BOAROUTE crest: a faceted neon shield with a gold "BR" monogram.
 * Geometry lives in br-logo-geometry.json so the app icon and splash render
 * from exactly the same shapes.
 *
 * @param {object} props
 * @param {number} [props.size=120] Width in dp. Height follows the crest aspect ratio.
 * @param {boolean} [props.animated=false] Gentle breathing glow (respects Reduce Motion).
 * @param {boolean} [props.glow=true] Outer neon halo. Turn off on light backgrounds.
 * @param {string} [props.accessibilityLabel]
 */
export function BRLogo({ size = 120, animated = false, glow = true, accessibilityLabel = 'BOAROUTE' }) {
  const id = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.5);
  // Fine details only where there are enough pixels to draw them crisply.
  const detailed = size >= 56;

  useEffect(() => {
    if (!animated || reduced) return undefined;
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [animated, reduced, pulse]);

  const haloProps = useAnimatedProps(() => ({ opacity: 0.35 + pulse.value * 0.45 }));

  const ids = {
    plate: `plate${id}`,
    rim: `rim${id}`,
    gold: `gold${id}`,
    sheen: `sheen${id}`,
  };

  return (
    <Svg
      width={size}
      height={size * BR_LOGO_ASPECT}
      viewBox={geo.viewBox.join(' ')}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Defs>
        <RadialGradient id={ids.plate} cx="50%" cy="30%" r="75%">
          <Stop offset="0" stopColor={c.plateTop} />
          <Stop offset="1" stopColor={c.plateBottom} />
        </RadialGradient>
        <LinearGradient id={ids.rim} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.blue} />
          <Stop offset="0.66" stopColor={c.blueDeep} />
          {/* Hard facet edge: blue meets gold without a muddy blend. */}
          <Stop offset="0.665" stopColor={c.gold} />
          <Stop offset="1" stopColor={c.goldDeep} />
        </LinearGradient>
        <LinearGradient id={ids.gold} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.goldLight} />
          <Stop offset="0.45" stopColor={c.gold} />
          <Stop offset="1" stopColor={c.goldDeep} />
        </LinearGradient>
        <LinearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="0.6">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {glow && (
        <AnimatedG animatedProps={haloProps} opacity={0.6}>
          <Path d={geo.shieldOuter} fill="none" stroke={c.blue} strokeWidth={16} strokeOpacity={0.14} strokeLinejoin="round" />
          <Path d={geo.shieldOuter} fill="none" stroke={c.blue} strokeWidth={9} strokeOpacity={0.28} strokeLinejoin="round" />
        </AnimatedG>
      )}

      {/* Faceted shield */}
      <Path d={geo.shieldOuter} fill={`url(#${ids.rim})`} />
      <Path d={geo.shieldInner} fill={`url(#${ids.plate})`} />
      <Path d={geo.bladeLeft} fill="#FFFFFF" fillOpacity={0.12} />
      <Path d={geo.bladeRight} fill="#000000" fillOpacity={0.18} />
      <Path d={geo.shieldInner} fill="none" stroke={c.blue} strokeOpacity={0.55} strokeWidth={1.4} strokeLinejoin="round" />

      {detailed && (
        <G>
          {geo.circuits.map((d) => (
            <Path key={d} d={d} fill="none" stroke={c.blue} strokeOpacity={0.55} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {geo.circuitNodes.map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={2.6} fill={c.blue} />
          ))}
        </G>
      )}

      {/* Crown and speed chevrons */}
      <Path d={geo.crown} fill={`url(#${ids.gold})`} />
      <Path d={geo.chevronOuter} fill={c.blue} fillOpacity={0.9} />
      {detailed && <Path d={geo.chevronInner} fill={`url(#${ids.gold})`} fillOpacity={0.9} />}

      {/* Monogram with a soft gold halo */}
      {glow && (
        <G>
          <Path d={geo.letterB} fill="none" stroke={c.gold} strokeOpacity={0.22} strokeWidth={7} strokeLinejoin="round" fillRule="evenodd" />
          <Path d={geo.letterR} fill="none" stroke={c.gold} strokeOpacity={0.22} strokeWidth={7} strokeLinejoin="round" fillRule="evenodd" />
        </G>
      )}
      <Path d={geo.letterB} fill={`url(#${ids.gold})`} fillRule="evenodd" />
      <Path d={geo.letterR} fill={`url(#${ids.gold})`} fillRule="evenodd" />
      <Path d={geo.letterB} fill="none" stroke={c.goldLight} strokeOpacity={0.7} strokeWidth={1} strokeLinejoin="round" fillRule="evenodd" />
      <Path d={geo.letterR} fill="none" stroke={c.goldLight} strokeOpacity={0.7} strokeWidth={1} strokeLinejoin="round" fillRule="evenodd" />

      {/* Glass sheen across the upper half */}
      <Path d="M23 45 L100 17 L177 45 L177 78 L23 104 Z" fill={`url(#${ids.sheen})`} />
    </Svg>
  );
}

export default BRLogo;
