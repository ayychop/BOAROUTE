// Extends app.json with build-time secrets. GOOGLE_MAPS_API_KEY comes from
// .env.local locally and from the EAS environment in cloud builds. It is the
// Maps SDK for Android key, so restrict it to this app's package and SHA-1
// in Google Cloud. The Directions API key lives server side as a Supabase secret.
//
// APP_VARIANT=dazzzit (set by the "dazzzit" EAS profile) builds Dazzzit, a
// standalone parked-only media launcher: its own package id and name so it
// installs alongside BOAROUTE, and ./plugins/withDazzzit in place of
// ./plugins/withAndroidAuto so only Dazzzit's car app service is registered.
// Everything else — the Maps key, location config — is shared.
const IS_DAZZZIT = (process.env.APP_VARIANT ?? '').trim() === 'dazzzit';

module.exports = ({ config }) => {
  const mapsKey = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim();
  const basePlugins = IS_DAZZZIT
    ? (config.plugins ?? []).map((p) => (p === './plugins/withAndroidAuto' ? './plugins/withDazzzit' : p))
    : (config.plugins ?? []);
  const plugins = [
    ...basePlugins,
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'BOAROUTE uses your location to guide you turn by turn and to place hazard reports on the map.',
        locationAlwaysAndWhenInUsePermission: 'BOAROUTE keeps using your location while you navigate with the screen off, so it can warn you about speed cameras and police ahead.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ];
  if (mapsKey) plugins.push(['react-native-maps', { androidGoogleMapsApiKey: mapsKey }]);

  const androidBase = IS_DAZZZIT
    ? { ...config.android, package: 'com.boanets.dazzzit' }
    : config.android;

  return {
    ...config,
    name: IS_DAZZZIT ? 'Dazzzit' : config.name,
    // Same key as the plugin above, also set in the classic location. It is read
    // from the environment because the repository is public.
    android: mapsKey ? { ...androidBase, config: { ...androidBase?.config, googleMaps: { apiKey: mapsKey } } } : androidBase,
    plugins,
    extra: {
      ...config.extra,
      // Without a key the Google map would crash on Android, so the app falls back to its own map.
      mapsConfigured: mapsKey.length > 0,
    },
  };
};
