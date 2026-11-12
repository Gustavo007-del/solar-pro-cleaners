import type { ExpoConfig } from 'expo/config';

import branding from './src/constants/metadata.json';
import nativeEnglish from './src/locales/native/en.json';
import palette from './src/theme/palette.json';

const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
if (appEnvironment !== 'development' && appEnvironment !== 'preview' && appEnvironment !== 'production') {
  throw new Error('EXPO_PUBLIC_APP_ENV must be development, preview, or production.');
}

const configuredName = process.env.EXPO_PUBLIC_APP_NAME?.trim();
const name = configuredName || branding.name;
const nameMl = process.env.EXPO_PUBLIC_APP_NAME_ML?.trim() || configuredName || branding.nameMl;
const baseId = process.env.ANDROID_APPLICATION_ID?.trim() || branding.applicationId;
const variantSuffix = appEnvironment === 'production' ? '' : `.${appEnvironment}`;
const schemeSuffix = appEnvironment === 'production' ? '' : `-${appEnvironment}`;
const projectId = process.env.EAS_PROJECT_ID?.trim() || '65562a15-9615-4e78-8c42-02d4cd3d652e';
const sdkOverride = process.env.ANDROID_TARGET_SDK?.trim();
const targetSdkVersion = sdkOverride ? Number(sdkOverride) : undefined;
if (sdkOverride && (!Number.isSafeInteger(targetSdkVersion) || !/^\d+$/.test(sdkOverride) || Number(sdkOverride) <= 0)) {
  throw new Error('ANDROID_TARGET_SDK must be a positive API level.');
}

const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-router',
  '@react-native-community/datetimepicker',
  ['expo-secure-store', { faceIDPermission: false }],
  ['expo-splash-screen', { image: branding.assets.splash, imageWidth: 160, resizeMode: 'contain', backgroundColor: palette.deep }],
  ['expo-navigation-bar', { enforceContrast: true, barStyle: 'dark', visibility: 'visible' }],
  ['expo-location', {
    locationWhenInUsePermission: nativeEnglish.ios.NSLocationWhenInUseUsageDescription,
    locationAlwaysAndWhenInUsePermission: false,
    locationAlwaysPermission: false,
    isIosBackgroundLocationEnabled: false,
    isAndroidBackgroundLocationEnabled: false,
    isAndroidForegroundServiceEnabled: false,
  }],
];

plugins.push(['expo-build-properties', { android: {
  compileSdkVersion: targetSdkVersion, targetSdkVersion,
  usesCleartextTraffic: appEnvironment === 'development',
} }]);

const blockedPermissions = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.GET_ACCOUNTS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.CALL_PHONE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
  'com.google.android.gms.permission.AD_ID',
];
if (appEnvironment !== 'development') blockedPermissions.push('android.permission.SYSTEM_ALERT_WINDOW');

export default {
  name,
  slug: branding.slug,
  owner: process.env.EXPO_OWNER?.trim() || 'shijil.py',
  version: branding.version,
  scheme: `${branding.scheme}${schemeSuffix}`,
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: palette.canvas,
  icon: branding.assets.icon,
  platforms: ['android', 'ios'],
  androidStatusBar: { barStyle: 'light-content' },
  android: {
    package: `${baseId}${variantSuffix}`,
    versionCode: branding.androidVersionCode,
    softwareKeyboardLayoutMode: 'resize',
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: branding.assets.adaptiveForeground,
      backgroundImage: branding.assets.adaptiveBackground,
      backgroundColor: palette.deep,
      monochromeImage: branding.assets.adaptiveMonochrome,
    },
    blockedPermissions,
  },
  ios: {
    bundleIdentifier: `${branding.applicationId}${variantSuffix}`,
    buildNumber: branding.iosBuildNumber,
    supportsTablet: true,
    infoPlist: { CFBundleAllowMixedLocalizations: true },
  },
  locales: {
    en: './src/locales/native/en.json',
    ml: './src/locales/native/ml.json',
  },
  plugins,
  extra: { appEnvironment, nameMl, eas: { projectId } },
  experiments: { typedRoutes: true },
} satisfies ExpoConfig;
