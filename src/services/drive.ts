import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { BoaRouteDrive } from '../../modules/boaroute-drive';
import type { LatLng } from '@/lib/types';
import { setRouteAwareAlerts, startHazardWatch } from '@/services/hazard-watch';

const SPOTIFY = 'com.spotify.music';

export function wazeUrl(to: LatLng): string {
  return `https://waze.com/ul?ll=${to.lat.toFixed(6)},${to.lng.toFixed(6)}&navigate=yes&zoom=17`;
}

/**
 * Hands the drive to Waze and leaves the Screen Saver underneath, so coming
 * back from Waze lands on the big Clock In button.
 *
 * The hazard foreground service starts first, while BOAROUTE is still in
 * front: Android 12+ refuses to start one from the background, and without
 * it the camera alerts would stop the moment Waze opens. It needs only normal
 * location permission (not "Allow all the time"), so a normal install always
 * gets it. Waze opens right after, or after 1.5 seconds at the latest.
 */
export async function navigateWithWaze(to: LatLng, { storeId }: { storeId?: string } = {}): Promise<void> {
  setRouteAwareAlerts(false);
  const watching = startHazardWatch({ prompt: true }).catch(() => false);
  router.push({ pathname: '/drive-mode', params: storeId ? { storeId } : {} });
  // Usually ready in well under 200 ms; the cap keeps a stuck permission check from holding Waze back.
  await Promise.race([watching, new Promise((r) => setTimeout(r, 1500))]);
  openWaze(to);
}

/** Opens Waze straight into navigation (or its store page / the web link without it). */
export function openWaze(to?: LatLng): void {
  if (BoaRouteDrive && Platform.OS === 'android') {
    if (to ? BoaRouteDrive.launchWaze(to.lat, to.lng) : BoaRouteDrive.launchApp('com.waze')) return;
  }
  Linking.openURL(to ? wazeUrl(to) : 'https://waze.com/ul').catch(() => {});
}

export function openSpotify(): void {
  if (BoaRouteDrive && Platform.OS === 'android' && BoaRouteDrive.launchApp(SPOTIFY)) return;
  Linking.openURL('spotify:')
    .catch(() => Linking.openURL('https://open.spotify.com'))
    .catch(() => {});
}

export function openEmail(): void {
  if (BoaRouteDrive && Platform.OS === 'android' && BoaRouteDrive.launchEmail()) return;
  Linking.openURL(Platform.OS === 'ios' ? 'message:' : 'mailto:').catch(() => {});
}
