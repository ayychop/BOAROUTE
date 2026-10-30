import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ToggleRow } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Slider } from '@/components/Slider';
import { Txt } from '@/components/Txt';
import { setPref } from '@/lib/prefs';
import { APPROACH_ALERT_M } from '@/lib/voice-alerts';
import { hasBackgroundAlertsPermission } from '@/services/hazard-watch';
import {
  CAMERA_ALERTS_PREF,
  POLICE_ALERTS_PREF,
  cameraAlertsOn,
  playVoiceNote,
  policeAlertsOn,
  setVoiceNav,
  setVoiceVolume,
  speakGuidance,
  stopVoiceNotes,
  voiceNavOn,
  voiceVolume,
} from '@/services/voice-notes';
import { useTheme } from '@/theme/ThemeProvider';

/** Me > Voice alerts: speed camera alerts, police alerts, spoken directions, volume and tests. */
export default function VoiceSettings() {
  const { palette } = useTheme();
  const [volume, setVolume] = useState(voiceVolume);
  const [cameras, setCameras] = useState(cameraAlertsOn);
  const [police, setPolice] = useState(policeAlertsOn);
  const [voiceNav, setVoiceNavState] = useState(voiceNavOn);
  const [locationOk, setLocationOk] = useState<boolean | null>(null);

  useEffect(() => {
    hasBackgroundAlertsPermission().then(setLocationOk);
    return () => stopVoiceNotes();
  }, []);

  return (
    <Screen back kicker="Driving" title="Voice alerts">
      <View style={{ gap: 12 }}>
        <GlassCard glow="gold" index={0}>
          <ToggleRow
            label="Speed camera alerts"
            hint={`One recorded voice note as you come within about half a mile (${APPROACH_ALERT_M} m) of a camera. It plays over Waze, Maps and music, which dip while it talks.`}
            value={cameras}
            onChange={(on) => {
              setCameras(on);
              setPref(CAMERA_ALERTS_PREF, String(on));
            }}
          />
          <View style={{ marginTop: 12 }}>
            <NeonButton label="Test camera alert" icon="camera" variant="outline" size="sm" onPress={() => playVoiceNote('camera_approaching', { force: true })} full />
          </View>
          {locationOk === false ? (
            <Txt variant="caption" tone="warning" style={{ marginTop: 8 }}>
              Location is off for BOAROUTE, so alerts cannot run while Waze or the lock screen is in front. Allow location in Settings (&quot;While using the app&quot; is enough).
            </Txt>
          ) : null}
        </GlassCard>

        <GlassCard index={1}>
          <ToggleRow
            label="Police alerts"
            hint="A spoken warning when a police report is ahead."
            value={police}
            onChange={(on) => {
              setPolice(on);
              setPref(POLICE_ALERTS_PREF, String(on));
            }}
          />
        </GlassCard>

        <GlassCard index={2}>
          <ToggleRow
            label="Voice navigation"
            hint='Speaks each turn as you drive in BOAROUTE, like "In 200 yards, turn left", so you never need to look at the map.'
            value={voiceNav}
            onChange={(on) => {
              setVoiceNavState(on);
              setVoiceNav(on);
              if (on) speakGuidance('Voice navigation is on.');
            }}
          />
        </GlassCard>

        <GlassCard index={3}>
          <Txt variant="label" tone="dim">
            Spoken voice volume
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Ionicons name="volume-low" size={20} color={palette.textDim} />
            <View style={{ flex: 1 }}>
              <Slider
                label="Spoken voice volume"
                value={volume}
                onChange={setVolume}
                onCommit={(v) => {
                  setVoiceVolume(v);
                  playVoiceNote('police_approaching', { force: true });
                }}
              />
            </View>
            <Ionicons name="volume-high" size={20} color={palette.gold} />
            <Txt variant="strong" style={{ width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {Math.round(volume * 100)}%
            </Txt>
          </View>
          <Txt variant="caption" tone="faint" style={{ marginTop: 6 }}>
            Sets police alerts and spoken directions. The speed camera note always plays at full strength, as a navigation prompt, so it is as loud as your phone&apos;s media volume allows.
          </Txt>
        </GlassCard>
      </View>
    </Screen>
  );
}
