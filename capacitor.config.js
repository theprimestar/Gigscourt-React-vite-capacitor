const config = {
  appId: 'com.gigscourt.app',
  appName: 'GigsCourt',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    allowNavigation: ['gigscourt-react-vite-capacitor.vercel.app'],
  },
  ios: {
    minVersion: '15.0',
    limitsNavigationsToAppBoundDomains: false,
  },
};

module.exports = config;
