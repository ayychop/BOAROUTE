// react-native-car-projection ships an automotive_app_desc.xml that always
// declares "media", which would also list BOAROUTE as an audio app in Android
// Auto. App resources win over library resources with the same name, so this
// writes a templates-only descriptor into the generated app module.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const DESCRIPTOR = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="template" />
</automotiveApp>
`;

module.exports = function withCarAppDescriptor(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'automotive_app_desc.xml'), DESCRIPTOR);
      return cfg;
    },
  ]);
};
