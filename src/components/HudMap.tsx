import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { LngLat } from '../../supabase/functions/_shared/route-analysis';
import type { LatLng } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/typography';

interface Props {
  width: number;
  height: number;
  start: LatLng;
  stops: LatLng[];
  motorway: LngLat[] | null;
  standard: LngLat[];
  selected: 'motorway' | 'standard';
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

export function HudMap({ width, height, start, stops, motorway, standard, selected }: Props) {
  const { palette } = useTheme();
  const all = useMemo<LngLat[]>(
    () => [[start.lng, start.lat], ...stops.map((s) => [s.lng, s.lat] as LngLat), ...(motorway ?? []), ...standard],
    [start, stops, motorway, standard],
  );
  const project = useProjection(all, width, height, 28);
  const toPoints = (line: LngLat[]) => line.map((p) => project(p).join(',')).join(' ');
  const [sx, sy] = project([start.lng, start.lat]);

  const motorwayActive = selected === 'motorway' && motorway;
  const gridColor = palette.primary;

  return (
    <View
      style={{ width, height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.phase === 'dawn' ? '#EAF4FF' : '#020814', borderWidth: 1, borderColor: palette.border }}
      accessibilityLabel={`Route map with ${stops.length} stops`}
    >
      <Svg width={width} height={height}>
        {/* HUD grid */}
        <G opacity={palette.phase === 'dawn' ? 0.12 : 0.1}>
          {Array.from({ length: Math.ceil(width / 28) }, (_, i) => (
            <Line key={`v${i}`} x1={i * 28} y1={0} x2={i * 28} y2={height} stroke={gridColor} strokeWidth={0.6} />
          ))}
          {Array.from({ length: Math.ceil(height / 28) }, (_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * 28} x2={width} y2={i * 28} stroke={gridColor} strokeWidth={0.6} />
          ))}
        </G>
        <Circle cx={sx} cy={sy} r={Math.min(width, height) * 0.42} stroke={gridColor} strokeOpacity={0.12} strokeDasharray="4 6" fill="none" />

        {/* Inactive option first, as a faint dashed trace */}
        {motorway && !motorwayActive && <Polyline points={toPoints(motorway)} fill="none" stroke={palette.gold} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" />}
        {motorwayActive && <Polyline points={toPoints(standard)} fill="none" stroke={palette.primary} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" />}

        {/* Active option with glow */}
        {(() => {
          const line = motorwayActive ? motorway! : standard;
          const color = motorwayActive ? palette.gold : palette.primary;
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
              <Circle cx={x} cy={y} r={11} fill={palette.phase === 'dawn' ? '#FFFFFF' : '#03101F'} stroke={palette.gold} strokeWidth={2} />
              <SvgText x={x} y={y + 4} fontSize={11} fontFamily={fonts.display} fill={palette.phase === 'dawn' ? palette.text : palette.gold} textAnchor="middle">
                {i + 1}
              </SvgText>
            </G>
          );
        })}

        {/* Home */}
        <Circle cx={sx} cy={sy} r={14} fill={palette.primary} fillOpacity={0.2} />
        <Circle cx={sx} cy={sy} r={7} fill={palette.primary} stroke="#FFFFFF" strokeWidth={2} />
      </Svg>
    </View>
  );
}
