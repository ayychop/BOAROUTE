// Extends app.json with build-time secrets. GOOGLE_MAPS_API_KEY comes from
// .env.local locally and from the EAS environment in cloud builds. It is the
// Maps SDK for Android key, so restrict it to this app's package and SHA-1
// in Google Cloud. The Directions API key lives server side as a Supabase secret.
module.exports = ({ config }) => {
  const mapsKey = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim();
  const plugins = [
    ...(config.plugins ?? []),
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

  return {
    ...config,
    // Same key as the plugin above, also set in the classic location. It is read
    // from the environment because the repository is public.
    android: mapsKey ? { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } } : config.android,
    plugins,
    extra: {
      ...config.extra,
      // Without a key the Google map would crash on Android, so the app falls back to its own map.
      mapsConfigured: mapsKey.length > 0,
    },
  };
};
