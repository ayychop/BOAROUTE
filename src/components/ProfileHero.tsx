import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLayout } from '@/hooks/useLayout';
import type { Vehicle } from '@/lib/vehicles';
import { useTheme } from '@/theme/ThemeProvider';
import { BRLogo } from './BRLogo';
import { GlassCard } from './GlassCard';
import { NumberPlate } from './NumberPlate';

/**
 * The Me screen header: the car photo edge to edge with the person's plate
 * at full size, and their details beside it (Fold inner screen, landscape)
 * or under it (phones). The plate's size comes from the space it really has,
 * so it reads the same on a Flip cover screen and an unfolded Fold, and the
 * two halves always share one height, so the card never has an empty corner.
 */
export function ProfileHero({ vehicle, plate, children }: { vehicle: Vehicle; plate: string; children: ReactNode }) {
  const { palette } = useTheme();
  const { compact, expanded, contentWidth } = useLayout();
  // Side by side the photo gets ~55% of the card; stacked it gets all of it.
  const photoWidth = expanded ? contentWidth * 0.55 : contentWidth;
  const plateHeight = Math.round(Math.min(44, Math.max(26, photoWidth * 0.075)));

  const photo = (
    <View style={expanded ? { flex: 11, minHeight: 220 } : { aspectRatio: compact ? 1.8 : 2.1 }}>
      <Image source={vehicle.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityIgnoresInvertColors />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', palette.surfaceStrong]}
        locations={[0, 0.4, 1]}
        start={expanded ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={expanded ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ position: 'absolute', top: 12, right: 12 }}>
        <BRLogo size={compact ? 28 : 34} glow={false} />
      </View>
      <View style={{ position: 'absolute', left: 16, bottom: 14 }}>
        <NumberPlate text={plate} height={plateHeight} maxWidth={photoWidth - 32} sheen />
      </View>
    </View>
  );

  return (
    <GlassCard glow="gold" animateIn={false} padded={false}>
      <View style={{ flexDirection: expanded ? 'row' : 'column', alignItems: 'stretch' }}>
        {photo}
        <View style={{ flex: expanded ? 9 : undefined, minWidth: 0, justifyContent: 'center', gap: 4, padding: compact ? 14 : 18, paddingTop: expanded ? 18 : 10 }}>{children}</View>
      </View>
    </GlassCard>
  );
}
