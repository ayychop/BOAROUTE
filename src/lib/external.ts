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
