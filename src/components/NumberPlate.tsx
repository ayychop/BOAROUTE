import { View } from 'react-native';
import { plateFontSize } from '@/lib/preferences';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

const PLATE_YELLOW = '#F6C445';
const PLATE_INK = '#121212';
const BAND_BLUE = '#1F4AA8';

/**
 * A UK rear number plate showing the driver's name (SARAH, JO, DAVID), with
 * the blue UK band. Scales from a badge on a card to the hero on Your vehicle.
 */
export function NumberPlate({ text, height = 30 }: { text: string; height?: number }) {
  const label = text.toUpperCase().slice(0, 8) || 'BOA';
  // Real UK plate proportions, so a short name and KMKM25ML sit on the same size plate.
  const width = height * 4.4;
  const band = height * 0.48;
  const padding = height * 0.25;
  const fontSize = plateFontSize(label, width - band - padding * 2, height);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Number plate reading ${label}`}
      style={{
        width,
        maxWidth: '100%',
        height,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderRadius: height * 0.14,
        backgroundColor: PLATE_YELLOW,
        borderWidth: Math.max(1, height * 0.05),
        borderColor: PLATE_INK,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      <View style={{ width: band, backgroundColor: BAND_BLUE, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: height * 0.08 }}>
        <Txt style={{ color: '#FFFFFF', fontFamily: fonts.bodyBold, fontSize: height * 0.24, lineHeight: height * 0.28 }} maxFontSizeMultiplier={1}>
          UK
        </Txt>
      </View>
      <View style={{ flex: 1, paddingHorizontal: padding, alignItems: 'center', justifyContent: 'center' }}>
        <Txt
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1}
          style={{ color: PLATE_INK, fontFamily: fonts.bodyBold, fontSize, lineHeight: fontSize * 1.15, letterSpacing: fontSize * 0.04, textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' }}
        >
          {label}
        </Txt>
      </View>
    </View>
  );
}
