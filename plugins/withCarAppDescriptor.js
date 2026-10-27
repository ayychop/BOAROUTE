// Writes BOAROUTE's own automotive_app_desc.xml into the generated app module
// (app resources win over the copy react-native-car-projection ships). It
// declares the templates car app and, while mediaSupport is on for that
// plugin in app.json, "media" too: Android Auto lists apps that offer a
// MediaBrowserService, so this keeps BOAROUTE in the car's launcher.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const descriptor = (media) => `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="template" />
${media ? '  <uses name="media" />\n' : ''}</automotiveApp>
`;

function mediaSupportOn(config) {
  const entry = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'react-native-car-projection');
  // The library's own default is true.
  return entry?.[1]?.mediaSupport !== false;
}

module.exports = function withCarAppDescriptor(config) {
  const media = mediaSupportOn(config);
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'automotive_app_desc.xml'), descriptor(media));
      return cfg;
    },
  ]);
};
