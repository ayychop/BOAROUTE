import { Image } from 'expo-image';
import { View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { openExternal } from '@/lib/external';
import { VEHICLES } from '@/lib/vehicles';
import { radius } from '@/theme/typography';

export default function Credits() {
  return (
    <Screen back kicker="About" title="Image credits">
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        Vehicle photos are from Wikimedia Commons and are used under their Creative Commons licences.
      </Txt>
      <View style={{ gap: 12 }}>
        {VEHICLES.map((v, i) => (
          <GlassCard key={v.id} index={i}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Image source={v.image} style={{ width: 96, height: 64, borderRadius: radius.sm }} contentFit="cover" />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="strong">{v.plate}</Txt>
                <Txt variant="caption" tone="dim">
                  Photo by {v.credit.author}, {v.credit.license}
                </Txt>
                <Txt variant="caption" tone="faint">
                  {v.credit.changes}
                </Txt>
              </View>
            </View>
            <NeonButton size="sm" variant="ghost" icon="open-outline" label="View source" onPress={() => openExternal(v.credit.source)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
          </GlassCard>
        ))}
        <GlassCard>
          <Txt variant="strong">Fonts</Txt>
          <Txt variant="caption" tone="dim">
            Orbitron and Rajdhani, SIL Open Font License, via Google Fonts.
          </Txt>
        </GlassCard>
        <GlassCard>
          <Txt variant="strong">Maps and places</Txt>
          <Txt variant="caption" tone="dim">
            Store locations geocoded with OpenStreetMap Nominatim (data © OpenStreetMap contributors, ODbL) and postcodes.io (Ordnance Survey data, OGL). Live routing by Mapbox.
          </Txt>
        </GlassCard>
      </View>
    </Screen>
  );
}
