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
  plugins: {
    OneSignalPlugin: {
      appId: 'da01f219-a990-4562-9365-6dd91b078b58',
    },
  },
};

module.exports = config;
