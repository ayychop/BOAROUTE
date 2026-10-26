import { memo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { fonts } from '@/theme/typography';

const VIEW_W = 320;
const VIEW_H = 136;

/** Five twin spokes, M Sport style, drawn around a wheel centre. */
function Rim({ cx, cy }: { cx: number; cy: number }) {
  const spokes = Array.from({ length: 5 }, (_, i) => (i * 72 * Math.PI) / 180);
  return (
    <G>
      <Circle cx={cx} cy={cy} r={25} fill="#0A0A0B" />
      <Circle cx={cx} cy={cy} r={24} fill="none" stroke="#2A2A2D" strokeWidth={1.2} />
      <Circle cx={cx} cy={cy} r={17} fill="url(#rim)" />
      {spokes.map((a, i) => (
        <G key={i}>
          <Line x1={cx + Math.cos(a - 0.12) * 4} y1={cy + Math.sin(a - 0.12) * 4} x2={cx + Math.cos(a - 0.1) * 16} y2={cy + Math.sin(a - 0.1) * 16} stroke="#2B2D31" strokeWidth={2.4} strokeLinecap="round" />
          <Line x1={cx + Math.cos(a + 0.12) * 4} y1={cy + Math.sin(a + 0.12) * 4} x2={cx + Math.cos(a + 0.1) * 16} y2={cy + Math.sin(a + 0.1) * 16} stroke="#2B2D31" strokeWidth={2.4} strokeLinecap="round" />
        </G>
      ))}
      <Circle cx={cx} cy={cy} r={17} fill="none" stroke="#E9ECEF" strokeOpacity={0.55} strokeWidth={0.8} />
      <Circle cx={cx} cy={cy} r={4.2} fill="#16171A" stroke="#9EA3AA" strokeWidth={0.8} />
    </G>
  );
}

/** Showroom-style UK plate on the lower body between the wheels, carrying the driver's name. */
function Plate({ text }: { text: string }) {
  const label = text.toUpperCase().slice(0, 8);
  const x = 122;
  const w = 82;
  const fontSize = label.length > 6 ? 9.5 : 11.5;
  return (
    <G>
      <Rect x={x} y={87} width={w} height={18} rx={2.5} fill="#F6C445" stroke="#121212" strokeWidth={1} />
      <Rect x={x + 0.5} y={87.5} width={9} height={17} rx={2} fill="#1F4AA8" />
      <SvgText x={x + 5} y={102} fontSize={4.2} fontFamily={fonts.bodyBold} fill="#FFFFFF" textAnchor="middle">
        UK
      </SvgText>
      <SvgText x={x + 9 + (w - 9) / 2} y={100} fontSize={fontSize} fontFamily={fonts.bodyBold} fill="#121212" textAnchor="middle" letterSpacing={0.8}>
        {label}
      </SvgText>
    </G>
  );
}

/**
 * Black BMW X1 M Sport Hybrid as a clean vector illustration: gloss black
 * paint, tinted glass, twin-spoke rims and a fine gold coachline. Vector, so it
 * stays crisp on every screen from the Flip cover to the unfolded Fold.
 */
export const CarIllustration = memo(function CarIllustration({ width, accent, shadow = 'rgba(0,0,0,0.35)', plate, label = 'Black BMW X1 M Sport Hybrid' }: { width: number; accent: string; shadow?: string; plate?: string | null; label?: string }) {
  const height = (width * VIEW_H) / VIEW_W;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} accessibilityRole="image" accessibilityLabel={plate ? `${label}, plate ${plate}` : label}>
      <Defs>
        <LinearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A4B51" />
          <Stop offset="0.28" stopColor="#1B1C1F" />
          <Stop offset="0.7" stopColor="#0B0B0C" />
          <Stop offset="1" stopColor="#030303" />
        </LinearGradient>
        <LinearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5C6470" />
          <Stop offset="0.45" stopColor="#1C2026" />
          <Stop offset="1" stopColor="#0A0C0F" />
        </LinearGradient>
        <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E3E6EA" />
          <Stop offset="0.5" stopColor="#9DA2AA" />
          <Stop offset="1" stopColor="#5D6168" />
        </LinearGradient>
        <RadialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#CFE2FF" />
        </RadialGradient>
      </Defs>

      {/* Ground shadow */}
      <Ellipse cx={162} cy={121} rx={142} ry={7} fill={shadow} />

      {/* Body: SUV profile, front to the right, wheel arches cut out */}
      <Path
        d="M26 104 L22 84 Q22 72 30 66 L47 43 Q55 33 69 32 L184 31 Q196 31 204 38 L234 62 L280 69 Q296 72 301 80 L305 95 Q305 104 298 106 L275 106 A33 33 0 0 0 209 106 L115 106 A33 33 0 0 0 49 106 Z"
        fill="url(#paint)"
        stroke={accent}
        strokeOpacity={0.55}
        strokeWidth={1}
      />

      {/* Glasshouse with B and C pillars */}
      <Path d="M58 62 L71 41 Q75 36.5 82 36.5 L183 35.5 Q191 35.5 196 40 L222 62 Z" fill="url(#glass)" />
      <Rect x={136} y={35.5} width={6} height={26.5} fill="#0B0B0C" />
      <Rect x={96} y={36} width={4} height={26} fill="#0B0B0C" />
      <Path d="M80 39 L121 38.5 L103 57 L70 58 Z" fill="#FFFFFF" fillOpacity={0.1} />

      {/* Roof rail */}
      <Path d="M70 31 L184 30" stroke="#8B9097" strokeOpacity={0.6} strokeWidth={1.4} strokeLinecap="round" />

      {/* Shoulder highlight and gold coachline */}
      <Path d="M34 72 Q150 66 288 75" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Path d="M40 92 L292 94" stroke={accent} strokeOpacity={0.8} strokeWidth={0.9} fill="none" />

      {/* Door shut lines and handles */}
      <Line x1={139} y1={63} x2={141} y2={104} stroke="#000000" strokeOpacity={0.7} strokeWidth={1} />
      <Line x1={196} y1={62} x2={204} y2={104} stroke="#000000" strokeOpacity={0.7} strokeWidth={1} />
      <Rect x={118} y={71} width={13} height={2.6} rx={1.3} fill="#9EA3AA" fillOpacity={0.7} />
      <Rect x={176} y={71} width={13} height={2.6} rx={1.3} fill="#9EA3AA" fillOpacity={0.7} />

      {/* Mirror */}
      <Path d="M211 56 L223 54 Q226 54 226 57 L225 62 L213 62 Z" fill="#141416" stroke={accent} strokeOpacity={0.4} strokeWidth={0.6} />

      {/* Front: headlight, kidney grille, lower intake */}
      <Path d="M279 74 L296 77.5 Q299 79 298.5 82 L283 80.5 Z" fill="url(#lamp)" />
      <Path d="M281 82.5 L296 84" stroke="#CFE2FF" strokeOpacity={0.9} strokeWidth={1} strokeLinecap="round" />
      <Rect x={299.5} y={83} width={4.5} height={11} rx={1.6} fill="#050505" stroke="#B9BEC5" strokeWidth={0.8} />
      <Path d="M286 98 L302 98" stroke="#2C2D31" strokeWidth={2.4} strokeLinecap="round" />

      {/* Rear: tail light and diffuser */}
      <Path d="M23 70 L35 66.5 L37 74 L24 77 Z" fill="#C3122C" />
      <Path d="M24 73.5 L36 71" stroke="#FF5A6E" strokeWidth={0.8} />
      <Path d="M28 100 L46 100" stroke="#2C2D31" strokeWidth={2.4} strokeLinecap="round" />

      {/* Dark wheel wells, so the arches never show the card through them */}
      <Path d="M51 106 A31 31 0 0 1 113 106 Z" fill="#050505" />
      <Path d="M211 106 A31 31 0 0 1 273 106 Z" fill="#050505" />

      {/* Wheels */}
      <Rim cx={82} cy={106} />
      <Rim cx={242} cy={106} />

      {plate ? <Plate text={plate} /> : null}
    </Svg>
  );
});
