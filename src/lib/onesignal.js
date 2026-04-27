import OneSignal from 'onesignal-cordova-plugin';

export function initOneSignal(onNotificationReceived) {
  if (typeof OneSignal === 'undefined') return;

  OneSignal.setAppId('da01f219-a990-4562-9365-6dd91b078b58');

  OneSignal.setNotificationOpenedHandler((notification) => {
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  OneSignal.setNotificationWillShowInForegroundHandler((notification) => {
    // Don't show push banner when app is open — silent badge update only
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });
}

export function getOneSignalUserId() {
  return new Promise((resolve) => {
    if (typeof OneSignal === 'undefined') {
      resolve(null);
      return;
    }
    OneSignal.getDeviceState().then((state) => {
      resolve(state?.userId || null);
    });
  });
}
