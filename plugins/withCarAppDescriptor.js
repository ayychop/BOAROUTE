// Android Auto setup on top of react-native-car-projection's own plugin.
//
// - Writes BOAROUTE's automotive_app_desc.xml into the generated app module
//   (app resources win over the copy the library ships). It declares the
//   templates car app only. Declaring "media" as well, or registering a
//   MediaBrowserService, makes Android Auto treat BOAROUTE as a media app: it
//   opens its own player UI and never shows the store list.
// - Gives the CarAppService the BOAROUTE name and a high-contrast icon
//   (gold shield on transparent, so it reads on the dark car launcher).
//   The library labels it "Android Auto Service" with no icon.
// - Removes the library's MediaBrowserService if it ever gets declared.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const CAR_SERVICE = 'expo.modules.androidauto.AndroidAutoCarAppService';
const MEDIA_SERVICE = 'expo.modules.androidauto.AndroidAutoMediaBrowserService';
const ICON = 'ic_boaroute_car';

const DESCRIPTOR = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="template" />
</automotiveApp>
`;

function carCategory(config) {
  const entry = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'react-native-car-projection');
  return (entry?.[1]?.carAppCategory ?? 'navigation').toUpperCase();
}

function withCarResources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      fs.mkdirSync(path.join(res, 'xml'), { recursive: true });
      fs.writeFileSync(path.join(res, 'xml', 'automotive_app_desc.xml'), DESCRIPTOR);
      fs.mkdirSync(path.join(res, 'drawable-nodpi'), { recursive: true });
      fs.copyFileSync(path.join(cfg.modRequest.projectRoot, 'assets', 'car-icon.png'), path.join(res, 'drawable-nodpi', `${ICON}.png`));
      return cfg;
    },
  ]);
}

function withCarManifest(config) {
  const category = carCategory(config);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error('Application not found in AndroidManifest');
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== MEDIA_SERVICE);

    // This mod can run before or after the library's, so add the service if it isn't there yet;
    // the library skips adding it when one with the same name exists.
    let service = app.service.find((s) => s.$['android:name'] === CAR_SERVICE);
    if (!service) {
      service = {
        $: { 'android:name': CAR_SERVICE, 'android:exported': 'true' },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'androidx.car.app.CarAppService' } }],
            category: [{ $: { 'android:name': `androidx.car.app.category.${category}` } }],
          },
        ],
      };
      app.service.push(service);
    }
    service.$['android:label'] = '@string/app_name';
    service.$['android:icon'] = `@drawable/${ICON}`;
    return cfg;
  });
}

module.exports = function withCarAppDescriptor(config) {
  return withCarManifest(withCarResources(config));
};
