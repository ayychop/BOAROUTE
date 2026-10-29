// Android Auto for BOAROUTE's own native module (modules/boaroute-car).
//
// - Declares BoarouteCarAppService as a NAVIGATION car app with the BOAROUTE
//   label and the white-ringed gold shield (assets/car-icon.png), so it shows
//   in the car launcher and pops on the dark dock.
// - Asks for the navigation template and map surface permissions the
//   NavigationTemplate needs.
// - Writes automotive_app_desc.xml declaring "media" and "template", and
//   declares a MediaBrowserService (BoarouteLauncherMediaService), so
//   Android Auto lists the sideloaded app in its launcher. On split-screen
//   cars it is also the side panel while another app (Waze) has the map:
//   Start / End Visit and the stores ahead as a list.
// - Copies the co-pilot voice notes into res/raw (with a keep rule so resource
//   shrinking never drops them; the code finds them by name).
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const CAR_SERVICE = 'expo.modules.boaroutecar.BoarouteCarAppService';
const MEDIA_SERVICE = 'expo.modules.boaroutecar.BoarouteLauncherMediaService';
const ICON = 'ic_boaroute_car';
const MIN_CAR_API_LEVEL = 1;
// CAR_SPEED lets ParkedWatch read the car's speed for the parked-only dash video.
const PERMISSIONS = ['androidx.car.app.NAVIGATION_TEMPLATES', 'androidx.car.app.ACCESS_SURFACE', 'com.google.android.gms.permission.CAR_SPEED'];
/** assets/sounds/<name>.mp3, played by CoPilotAudio as res/raw/<name>. */
const VOICE_NOTES = ['camera_approaching', 'camera_passing'];

const DESCRIPTOR = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="media" />
  <uses name="template" />
</automotiveApp>
`;

const KEEP = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="${VOICE_NOTES.map((n) => `@raw/${n}`).join(',')}" />
`;

function withCarResources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const dir of ['xml', 'drawable-nodpi', 'raw']) fs.mkdirSync(path.join(res, dir), { recursive: true });
      fs.writeFileSync(path.join(res, 'xml', 'automotive_app_desc.xml'), DESCRIPTOR);
      fs.copyFileSync(path.join(root, 'assets', 'car-icon.png'), path.join(res, 'drawable-nodpi', `${ICON}.png`));
      for (const name of VOICE_NOTES) fs.copyFileSync(path.join(root, 'assets', 'sounds', `${name}.mp3`), path.join(res, 'raw', `${name}.mp3`));
      fs.writeFileSync(path.join(res, 'raw', 'boaroute_keep.xml'), KEEP);
      return cfg;
    },
  ]);
}

function upsertMeta(app, name, attrs) {
  app['meta-data'] = (app['meta-data'] ?? []).filter((m) => m.$['android:name'] !== name);
  app['meta-data'].push({ $: { 'android:name': name, ...attrs } });
}

function withCarManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) throw new Error('Application not found in AndroidManifest');

    const perms = (manifest['uses-permission'] ??= []);
    for (const name of PERMISSIONS) {
      if (!perms.some((p) => p.$['android:name'] === name)) perms.push({ $: { 'android:name': name } });
    }

    // Let the "Navigate with Waze" hand-off (and its Google Maps fallback)
    // resolve their packages under Android 11+ package visibility.
    const queries = (manifest.queries ??= [{}]);
    const q = (queries[0] ??= {});
    q.package = q.package ?? [];
    for (const name of ['com.waze', 'com.google.android.apps.maps']) {
      if (!q.package.some((p) => p.$['android:name'] === name)) q.package.push({ $: { 'android:name': name } });
    }

    upsertMeta(app, 'com.google.android.gms.car.application', { 'android:resource': '@xml/automotive_app_desc' });
    upsertMeta(app, 'androidx.car.app.minCarApiLevel', { 'android:value': String(MIN_CAR_API_LEVEL) });

    // Any service from the old react-native-car-projection setup goes.
    app.service = (app.service ?? []).filter(
      (s) => !s.$['android:name'].startsWith('expo.modules.androidauto.') && ![CAR_SERVICE, MEDIA_SERVICE].includes(s.$['android:name'])
    );
    app.service.push({
      $: { 'android:name': CAR_SERVICE, 'android:exported': 'true', 'android:label': '@string/app_name', 'android:icon': `@drawable/${ICON}` },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'androidx.car.app.CarAppService' } }],
          category: [{ $: { 'android:name': 'androidx.car.app.category.NAVIGATION' } }],
        },
      ],
    });
    app.service.push({
      $: { 'android:name': MEDIA_SERVICE, 'android:exported': 'true', 'android:label': '@string/app_name', 'android:icon': `@drawable/${ICON}` },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.media.browse.MediaBrowserService' } }] }],
    });
    return cfg;
  });
}

module.exports = function withAndroidAuto(config) {
  return withCarManifest(withCarResources(config));
};
