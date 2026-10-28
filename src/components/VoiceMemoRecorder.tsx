import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert } from 'react-native';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { uploadVoiceMemo } from '@/services/voice-memos';

/** Whole seconds as m:ss. */
function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/**
 * One button that records a voice note and uploads it as a shared team memo.
 * Tap to start, tap to stop and save. Optionally tags the memo to a store.
 */
export function VoiceMemoRecorder({ storeId = null, onSaved }: { storeId?: string | null; onSaved?: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone is off', 'Allow microphone access in Settings to record a memo.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e) {
      Alert.alert('Could not start recording', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const stopAndSave = async () => {
    setBusy(true);
    const seconds = Math.round(state.durationMillis / 1000);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
      const uri = recorder.uri;
      if (!uri) throw new Error('Nothing was recorded.');
      await uploadVoiceMemo(uri, { storeId, durationSeconds: seconds });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved?.();
    } catch (e) {
      Alert.alert('Could not save memo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <NeonButton
        label={busy ? 'Saving…' : state.isRecording ? `Stop & save · ${clock(state.durationMillis)}` : 'Record memo'}
        icon={state.isRecording ? 'stop-circle' : 'mic'}
        variant={state.isRecording ? 'ghost' : 'gold'}
        loading={busy}
        onPress={state.isRecording ? stopAndSave : start}
        full
      />
      {state.isRecording ? (
        <Txt variant="caption" tone="faint" style={{ marginTop: 8 }}>
          Recording. Everyone on the team can hear this note.
        </Txt>
      ) : null}
    </>
  );
}
