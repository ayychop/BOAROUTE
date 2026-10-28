import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { VoiceMemoList } from '@/components/VoiceMemoList';
import { VoiceMemoRecorder } from '@/components/VoiceMemoRecorder';

/** Shared team voice notes: record one, and the whole team can play them back. */
export default function Memos() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Screen kicker="Team" title="Voice memos" back>
      <GlassCard animateIn={false}>
        <Txt variant="label" tone="dim" style={{ marginBottom: 12 }}>
          New memo
        </Txt>
        <VoiceMemoRecorder onSaved={() => setRefreshKey((k) => k + 1)} />
      </GlassCard>

      <SectionHeader title="Recent" />
      <VoiceMemoList refreshKey={refreshKey} />
    </Screen>
  );
}
