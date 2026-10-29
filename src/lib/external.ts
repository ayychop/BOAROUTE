import * as Clipboard from 'expo-clipboard';
import { Alert, Linking } from 'react-native';

/** Opens a link in Maps or the browser. Reports a failure instead of silently doing nothing. */
export async function openExternal(url: string, failTitle = 'Could not open link', failBody = 'Please try again.'): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(failTitle, failBody);
    return false;
  }
}

/** Opens Google Maps (or the browser) and explains what to install if neither is available. */
export const openMaps = (url: string) => openExternal(url, 'Could not open Maps', 'Install Google Maps or try again.');

/**
 * Hands a destination to Waze for turn-by-turn, so it drives on the car screen
 * while BOAROUTE stays in the background as the co-pilot. Waze takes a single
 * destination, not a multi-stop route. Falls back to Google Maps (app if
 * installed, else the browser) when Waze is not installed. We try to open
 * rather than canOpenURL so no app-query manifest entry is required to work.
 */
export async function openWaze(lat: number, lng: number): Promise<boolean> {
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  try {
    await Linking.openURL(`waze://?ll=${lat},${lng}&navigate=yes`);
    return true;
  } catch {
    // Waze is not installed (or refused the link): Google Maps instead.
    return openMaps(maps);
  }
}

/** Copies text to the clipboard. Returns false (after telling the person) if the system refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    Alert.alert('Could not copy', 'Your device blocked clipboard access. Select the text and copy it manually.');
    return false;
  }
}
