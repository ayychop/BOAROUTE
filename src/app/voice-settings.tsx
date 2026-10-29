import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ToggleRow } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Txt } from '@/components/Txt';
import { getPref, setPref } from '@/lib/prefs';
import { APPROACH_ALERT_M, PASSING_ALERT_M } from '@/lib/voice-alerts';
import { hasBackgroundAlertsPermission } from '@/services/hazard-watch';
import { playVoiceNote, setVoiceVolume, stopVoiceNotes, voiceVolume } from '@/services/voice-notes';
import { useTheme } from '@/theme/ThemeProvider';

/** Me > Voice alerts: volume for the speed camera and police voice notes, mute, and a test. */
export default function VoiceSettings() {
  const { palette } = useTheme();
  const [volume, setVolume] = useState(voiceVolume);
  const [muted, setMuted] = useState(getPref('nav.muted') === 'true');
  const [background, setBackground] = useState<boolean | null>(null);

  useEffect(() => {
    hasBackgroundAlertsPermission().then(setBackground);
    return () => stopVoiceNotes();
  }, []);

  return (
    <Screen back kicker="Driving" title="Voice alerts">
      <View style={{ gap: 12 }}>
        <GlassCard glow="gold">
          <Txt variant="label" tone="dim">
            Voice note volume
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Ionicons name="volume-low" size={20} color={palette.textDim} />
            <View style={{ flex: 1 }}>
              <Slider
                label="Voice note volume"
                value={volume}
                onChange={setVolume}
                onCommit={(v) => {
                  setVoiceVolume(v);
                  playVoiceNote('camera_passing', { force: true });
                }}
              />
            </View>
            <Ionicons name="volume-high" size={20} color={palette.gold} />
            <Txt variant="strong" style={{ width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {Math.round(volume * 100)}%
            </Txt>
          </View>
          <Txt variant="caption" tone="faint" style={{ marginTop: 6 }}>
            Waze and Spotify dip while a note plays and come straight back after. This sets the note itself; the phone&apos;s media volume still applies.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <NeonButton label="Test camera" icon="camera" variant="outline" size="sm" onPress={() => playVoiceNote('camera_approaching', { force: true })} style={{ flex: 1 }} />
            <NeonButton label="Test police" icon="shield" variant="outline" size="sm" onPress={() => playVoiceNote('police_approaching', { force: true })} style={{ flex: 1 }} />
          </View>
        </GlassCard>

        <GlassCard index={1}>
          <ToggleRow
            label="Voice alerts on"
            hint={`Two notes per camera or police report: at ${APPROACH_ALERT_M} m and again at ${PASSING_ALERT_M} m.`}
            value={!muted}
            onChange={(on) => {
              setMuted(!on);
              setPref('nav.muted', String(!on));
            }}
          />
          {background === false ? (
            <Txt variant="caption" tone="warning" style={{ marginTop: 8 }}>
              Location is not set to &quot;Allow all the time&quot;, so notes stop when Waze or the lock screen is in front. Start navigation once in BOAROUTE to be asked, or change it in Settings.
            </Txt>
          ) : null}
        </GlassCard>
      </View>
    </Screen>
  );
}
