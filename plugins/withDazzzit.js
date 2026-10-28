// Android Auto for the Dazzzit build variant (APP_VARIANT=dazzzit).
//
// Dazzzit is a standalone sideloaded APK built from this same project with its
// own package id (com.boanets.dazzzit) — see app.config.js. This plugin is the
// Dazzzit counterpart of ./withAndroidAuto: it registers DazzzitCarAppService
// as a NAVIGATION car app (which grants the full car Surface the launcher grid
// and parked-only YouTube draw on) and an empty MediaBrowserService so Android
// Auto lists the sideloaded app in its launcher. The Kotlin for both variants
// lives in the one modules/boaroute-car module; only the manifest decides which
// car app service is active, so a Dazzzit APK never exposes BOAROUTE's screen
// and vice versa.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const CAR_SERVICE = 'expo.modules.boaroutecar.DazzzitCarAppService';
// Reused as-is: an empty browser whose only job is to get the app listed.
const MEDIA_SERVICE = 'expo.modules.boaroutecar.BoarouteLauncherMediaService';
// The car-only brand: this is what the Android Auto launcher shows, while the
// phone app stays "BOAROUTE" (@string/app_name). The DZ logo is a drawable
// shipped by the boaroute-car module, so it resolves in the merged manifest.
const CAR_LABEL = 'DAZZZIT';
const ICON = 'ic_dazzzit_dz';
const MIN_CAR_API_LEVEL = 1;
// CAR_SPEED lets ParkedWatch read the car's speed for the parked-only gate.
const PERMISSIONS = ['androidx.car.app.NAVIGATION_TEMPLATES', 'androidx.car.app.ACCESS_SURFACE', 'com.google.android.gms.permission.CAR_SPEED'];

const DESCRIPTOR = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="media" />
  <uses name="template" />
</automotiveApp>
`;

function withCarResources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      fs.mkdirSync(path.join(res, 'xml'), { recursive: true });
      fs.writeFileSync(path.join(res, 'xml', 'automotive_app_desc.xml'), DESCRIPTOR);
      // The DZ car logo (@drawable/ic_dazzzit_dz) ships in the boaroute-car
      // module's own res, so there is nothing to copy here.
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

    upsertMeta(app, 'com.google.android.gms.car.application', { 'android:resource': '@xml/automotive_app_desc' });
    upsertMeta(app, 'androidx.car.app.minCarApiLevel', { 'android:value': String(MIN_CAR_API_LEVEL) });

    app.service = (app.service ?? []).filter((s) => ![CAR_SERVICE, MEDIA_SERVICE].includes(s.$['android:name']));
    app.service.push({
      $: { 'android:name': CAR_SERVICE, 'android:exported': 'true', 'android:label': CAR_LABEL, 'android:icon': `@drawable/${ICON}` },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'androidx.car.app.CarAppService' } }],
          category: [{ $: { 'android:name': 'androidx.car.app.category.NAVIGATION' } }],
        },
      ],
    });
    app.service.push({
      $: { 'android:name': MEDIA_SERVICE, 'android:exported': 'true', 'android:label': CAR_LABEL, 'android:icon': `@drawable/${ICON}` },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.media.browse.MediaBrowserService' } }] }],
    });
    return cfg;
  });
}

module.exports = function withDazzzit(config) {
  return withCarManifest(withCarResources(config));
};
