import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Polyline, Text as SvgText } from 'react-native-svg';
import type { LngLat } from '../../supabase/functions/_shared/route-analysis';
import type { LatLng } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/typography';

interface Props {
  width: number;
  height: number;
  start: LatLng;
  /** Finish point when it differs from the start (a route that starts at a store and ends at home). */
  end?: LatLng | null;
  stops: LatLng[];
  motorway: LngLat[] | null;
  standard: LngLat[];
  selected: 'motorway' | 'standard';
  /** Colour for the active route (the navigator uses the driver's chosen trail colour). */
  routeColor?: string;
}

/** Equirectangular projection fitted to the route, corrected for UK latitude. */
function useProjection(points: LngLat[], width: number, height: number, pad: number) {
  return useMemo(() => {
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    let minX = Math.min(...lngs);
    let maxX = Math.max(...lngs);
    let minY = Math.min(...lats);
    let maxY = Math.max(...lats);
    if (!Number.isFinite(minX)) return () => [width / 2, height / 2] as const;
    const midLat = (minY + maxY) / 2;
    const k = Math.cos((midLat * Math.PI) / 180);
    // Keep a sensible minimum span so a single town does not explode in size.
    const span = Math.max((maxX - minX) * k, maxY - minY, 0.02);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    minX = cx - span / k / 2;
    maxX = cx + span / k / 2;
    minY = cy - span / 2;
    maxY = cy + span / 2;
    const scale = Math.min((width - pad * 2) / ((maxX - minX) * k), (height - pad * 2) / (maxY - minY));
    const offX = (width - (maxX - minX) * k * scale) / 2;
    const offY = (height - (maxY - minY) * scale) / 2;
    return ([lng, lat]: LngLat) => [offX + (lng - minX) * k * scale, offY + (maxY - lat) * scale] as const;
  }, [points, width, height, pad]);
}

export function HudMap({ width, height, start, end, stops, motorway, standard, selected, routeColor }: Props) {
  const { palette } = useTheme();
  const all = useMemo<LngLat[]>(
    () => [[start.lng, start.lat], ...(end ? [[end.lng, end.lat] as LngLat] : []), ...stops.map((s) => [s.lng, s.lat] as LngLat), ...(motorway ?? []), ...standard],
    [start, end, stops, motorway, standard],
  );
  const project = useProjection(all, width, height, 28);
  const toPoints = (line: LngLat[]) => line.map((p) => project(p).join(',')).join(' ');
  const [sx, sy] = project([start.lng, start.lat]);
  const finish = end && (end.lat !== start.lat || end.lng !== start.lng) ? project([end.lng, end.lat]) : null;

  const motorwayActive = selected === 'motorway' && motorway;
  const standardColor = palette.platinum;

  return (
    <View
      style={{ width, height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border }}
      accessibilityLabel={`Route map with ${stops.length} stops`}
    >
      <Svg width={width} height={height}>
        {/* Fine range rings around home */}
        {[0.22, 0.42, 0.64].map((f) => (
          <Circle key={f} cx={sx} cy={sy} r={Math.min(width, height) * f} stroke={palette.primary} strokeOpacity={0.1} strokeWidth={0.8} fill="none" />
        ))}

        {/* Inactive option first, as a faint dashed trace */}
        {motorway && !motorwayActive && <Polyline points={toPoints(motorway)} fill="none" stroke={palette.gold} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" />}
        {motorwayActive && <Polyline points={toPoints(standard)} fill="none" stroke={standardColor} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" />}

        {/* Active option with glow */}
        {(() => {
          const line = motorwayActive ? motorway! : standard;
          const color = routeColor ?? (motorwayActive ? palette.gold : standardColor);
          return (
            <G>
              <Polyline points={toPoints(line)} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" />
              <Polyline points={toPoints(line)} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
              <Polyline points={toPoints(line)} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
            </G>
          );
        })()}

        {/* Stops */}
        {stops.map((s, i) => {
          const [x, y] = project([s.lng, s.lat]);
          return (
            <G key={`${s.lat},${s.lng},${i}`}>
              <Circle cx={x} cy={y} r={11} fill={palette.bg[2]} stroke={palette.gold} strokeWidth={1.5} />
              <SvgText x={x} y={y + 4} fontSize={11} fontFamily={fonts.bodyBold} fill={palette.gold} textAnchor="middle">
                {i + 1}
              </SvgText>
            </G>
          );
        })}

        {/* Finish, when it is not where the day started */}
        {finish && <Circle cx={finish[0]} cy={finish[1]} r={8} fill="none" stroke={palette.gold} strokeWidth={2.5} />}

        {/* Start */}
        <Circle cx={sx} cy={sy} r={14} fill={palette.primary} fillOpacity={0.2} />
        <Circle cx={sx} cy={sy} r={7} fill={palette.primary} stroke={palette.text} strokeWidth={2} />
      </Svg>
    </View>
  );
}
