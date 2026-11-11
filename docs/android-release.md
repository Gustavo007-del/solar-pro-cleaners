# Android release preparation

The current app stores profiles and booking requests on the device. The production build profile prepares an Android App Bundle. Customer authentication, business-side booking delivery, and server-side deletion depend on future backend integration.

## App identity and assets

| Input | Configuration |
| --- | --- |
| App name and Malayalam name | Defaults in `src/constants/metadata.json`, with optional `EXPO_PUBLIC_APP_NAME` and `EXPO_PUBLIC_APP_NAME_ML` overrides |
| Slug, deep-link scheme, app version | `src/constants/metadata.json` |
| Android application ID | `ANDROID_APPLICATION_ID` overrides the provisional `com.solarcare.app` |
| Initial Android version code and iOS build number | `src/constants/metadata.json`. EAS manages subsequent production build numbers remotely |
| Expo project | Business-owned `EXPO_OWNER` and `EAS_PROJECT_ID` |
| Launcher and splash images | `assets/branding/`, referenced from the branding metadata |

The solar mark is provisional. Replace it with approved artwork at the same asset paths. Use a full-bleed 1024 × 1024 PNG for the main icon and adaptive background. Keep the adaptive foreground and monochrome layers transparent, with the mark inside Android's safe region. Use a transparent splash PNG. The native launch screen and in-app splash use the same mark. [Expo app icons](https://docs.expo.dev/develop/user-interface/app-icons/) · [Expo splash screen](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/)

The production ID becomes the Play Store package identity. Development and preview append `.development` or `.preview` and use separate deep-link schemes. The resulting apps have separate Android storage, so their profiles and bookings are isolated from the production app.

## Environment and builds

| EAS profile | EAS environment | Android artifact |
| --- | --- | --- |
| Development | `development` | Internal APK with Expo development client |
| Preview | `preview` | Internal APK with release behavior |
| Production | `production` | Store AAB with remote signing credentials and automatic version code increment |

`eas.json` selects the environment and the matching `EXPO_PUBLIC_APP_ENV`. `.env.example` documents the public configuration surface. Supply environment-specific API and business values through the selected EAS environment. The mobile bundle can expose any `EXPO_PUBLIC_*` value. Database passwords, Supabase service-role keys, private keys, and admin credentials belong on the server. Keep signing credentials in the business-owned EAS workflow. [EAS configuration](https://docs.expo.dev/eas/json/) · [EAS environment variables](https://docs.expo.dev/eas/environment-variables/) · [EAS app versions](https://docs.expo.dev/build-reference/app-versions/)

SDK 55 defaults to Android API 36 for both compiling and targeting. Google Play's current requirements for new standard Android apps and updates also specify API 36 or higher as of 11 November 2026. Leave `ANDROID_TARGET_SDK` unset for the SDK defaults. A compatible override sets both Android compile and target API levels when a future release requires it. [Expo SDK 55](https://docs.expo.dev/versions/v55.0.0/) · [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)

Android uses edge-to-edge system bars, safe-area insets, and keyboard resize. The navigation bar uses contrast enforcement and changes its icon appearance between the dark splash and light screens. The app declares coarse and fine foreground location through Expo Location. It asks for permission only after the customer requests GPS during booking. Manual address entry is available. The app config blocks background location, camera, audio recording, contacts, media and storage permissions, direct calling, notifications, and advertising ID. Calls use the system dialer. Android automatic backup is disabled in the app configuration. [Expo NavigationBar](https://docs.expo.dev/versions/v55.0.0/sdk/navigation-bar/) · [Expo Location](https://docs.expo.dev/versions/v55.0.0/sdk/location/)

## Business inputs and backend boundaries

- Approved app identity and artwork, Android package ID, and business-owned Expo and Play Console accounts.
- Business display and legal names, support email, phone, WhatsApp number if separate, and any published address, working hours, or website.
- Approved privacy policy and terms. Supply the corresponding public HTTPS URLs when published.
- A functional public deletion request page when required for the final account model. `EXPO_PUBLIC_ACCOUNT_DELETION_URL` exposes that link from the in-app deletion flow once provided. Opening the link delegates the request to the published page.
- A public FastAPI HTTPS base URL when the backend is available. The centralized API configuration accepts local HTTP addresses only in development. The app continues using its existing local services.

The profile and booking repositories are the integration points for authenticated FastAPI requests. A future server must enforce customer ownership, deduplicate booking submissions, and implement approved retention and deletion handling. Keep Supabase access and privileged operations on the server. The app currently reports deletion as unavailable and retains local records. Keep errors customer-facing and exclude customer names, phone numbers, addresses, coordinates, and instructions from diagnostic logs.

[Play listing and Data Safety preparation](./play-store.md)
