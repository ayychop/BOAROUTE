import { View } from 'react-native';
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
  // Names are short; a full registration like "AB12 CDE" steps the type down so the plate stays compact.
  const fontSize = height * 0.62 * Math.min(1, 6 / Math.max(label.length, 1));
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Number plate reading ${label}`}
      style={{
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
      <View style={{ width: height * 0.5, backgroundColor: BAND_BLUE, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: height * 0.08 }}>
        <Txt style={{ color: '#FFFFFF', fontFamily: fonts.bodyBold, fontSize: height * 0.22, lineHeight: height * 0.26 }} maxFontSizeMultiplier={1}>
          UK
        </Txt>
      </View>
      <View style={{ flexShrink: 1, paddingHorizontal: height * 0.35, justifyContent: 'center' }}>
        <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1} style={{ color: PLATE_INK, fontFamily: fonts.bodyBold, fontSize, lineHeight: height * 0.72, letterSpacing: fontSize * (label.length > 6 ? 0.04 : 0.08) }}>
          {label}
        </Txt>
      </View>
    </View>
  );
}
