# Solar Care

Solar Care is an Android-first Expo app for a solar panel cleaning and maintenance service. It includes first-launch setup, customer accounts, a live service catalogue, saved addresses, and booking management.

The [FastAPI backend](./backend/README.md) lives in `backend/`. It is the source of truth for customer profiles, business information, addresses, pricing and bookings.

[Android release preparation](./docs/android-release.md) covers branding, environment configuration, package identity, permissions, EAS profiles, and the business inputs required before release. [Play Store preparation](./docs/play-store.md) covers listing copy, asset locations, Data Safety, and the public deletion request page.

## Routes

| Route | Presentation |
| --- | --- |
| `/` | Splash and saved-state initialization |
| `/language` | First-launch language selection |
| `/welcome` | Three-page onboarding |
| `/profile-setup` | Customer registration or sign-in using this device's saved installation |
| `/privacy-policy`, `/terms-and-conditions` | Draft legal documents linked from registration and account screens |
| `/home` | Personalized service home screen |
| `/services/:serviceId` | Service details, benefits and pricing |
| `/my-bookings` | Customer booking history with status counters and filters |
| `/contact` | Business contact information, call and WhatsApp actions, and booking assistance |
| `/profile` | Customer profile, edit action, and account menu |
| `/booking` | Booking form with GPS or manual address entry |
| `/booking/success/:bookingId` | Receipt for the current customer's saved request |
| `/booking/:bookingId` | Customer-scoped booking details and status timeline |
| `/settings` | Language preferences, account, legal, and app information |
| `/settings/edit-profile`, `/settings/account` | Profile editing and account information |
| `/settings/addresses` | Create, edit, delete and set default saved addresses |
| `/settings/data-usage`, `/settings/delete-account` | Data usage and account deletion confirmation |

The application provider restores language and onboarding preferences from AsyncStorage and restores the server session through Expo SecureStore. Protected routes open after the session is verified. Refresh rotation is shared by concurrent requests. Signing out clears the token pair and keeps the installation credential for a deliberate sign-in.

Customer names are trimmed and Indian mobile numbers are stored as `+91` followed by ten digits. Server profiles use UUIDs and timezone-aware timestamps. Records created by an older local-only build remain separate and are never submitted automatically.

Home and Contact use the published FastAPI business profile for phone, WhatsApp, email and website. Contact also reads operating hours, closures and service areas.

## Account

Profile edits apply to future requests. Historical bookings retain the contact details saved when the request was created. Language changes apply across the app and persist on the device.

The in-app Privacy Policy and Terms are drafts for business approval. The deletion screen opens the configured request page or the backend's public support page. Direct account deletion is pending a business-approved backend workflow.

## Booking

Choose a service, requested date and saved, GPS or manual address. GPS requests foreground permission only when selected. The backend computes the estimate, snapshots the contact and address, and returns a pending booking with its reference.

The app retains the booking form in memory. An encrypted submission key and request fingerprint allow a retry of the same payload after a lost response or restart. Check My Bookings before submitting a different payload if the earlier outcome is unknown.

My Bookings refreshes on focus, supports pull to refresh, and pages through customer-scoped results. Details display the server timeline and offer confirmed cancellation of pending requests.

## Integration verification

The production EAS profile uses the configured Render HTTPS API. For local testing, override `EXPO_PUBLIC_API_BASE_URL` with the full versioned URL. An Android emulator uses the host alias `10.0.2.2`, and a physical device uses the development computer's reachable LAN address. Preview and production require HTTPS. Rebuild an existing development client after adding SecureStore.

Run `npx tsc --noEmit` and `npx expo export --platform android` from the project root. To exercise the mobile HTTP and session code against FastAPI and PostgreSQL, set `TEST_POSTGRES_URL` to a local disposable PostgreSQL cluster with database creation rights, then run `python -m tests.run_mobile_integration` from `backend` with the backend requirements installed. The runner creates and removes its own test database and uses in-memory replacements for the native storage and cryptography adapters.

## Extension points

- Keep route files in `app/` and place feature implementation in `src/features/`.
- Import shared controls from `src/components/` and design tokens from `src/theme/`. NativeWind and the React Native theme share `src/theme/palette.json`.
- Keep interface strings in both locale JSON files. The `useAppLanguage` hook switches the language and stores the preference with AsyncStorage. English is the initial default.
- Shared providers, state, localization, and runtime configuration live in `src/providers/`, `src/store/`, `src/locales/`, and `src/constants/`. Native assets are grouped in `assets/branding/`.
- Build FastAPI clients in `src/services/api/`, using `resolveApiUrl` with the full versioned base configured in `EXPO_PUBLIC_API_BASE_URL`. The [frontend integration guide](./backend/docs/integration.md) covers session recovery, SecureStore, booking retries, and response types. React Hook Form, Zod, and the Zod resolver are available for form modules.
