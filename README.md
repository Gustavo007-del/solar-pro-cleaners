# Solar Care

Solar Care is an Android-first Expo app for a solar panel cleaning and maintenance service. It includes first-launch setup, onboarding, local customer registration, a personalized home screen, and a local booking flow.

The [FastAPI backend foundation](./backend/README.md) lives in `backend/`. The mobile app continues to use its on-device profile and booking services.

[Android release preparation](./docs/android-release.md) covers branding, environment configuration, package identity, permissions, EAS profiles, and the business inputs required before release. [Play Store preparation](./docs/play-store.md) covers listing copy, asset locations, Data Safety, and the public deletion request page.

## Routes

| Route | Presentation |
| --- | --- |
| `/` | Splash and saved-state initialization |
| `/language` | First-launch language selection |
| `/welcome` | Three-page onboarding |
| `/profile-setup` | Customer registration |
| `/privacy-policy`, `/terms-and-conditions` | Draft legal documents linked from registration and account screens |
| `/home` | Personalized service home screen |
| `/my-bookings` | Customer booking history with status counters and filters |
| `/contact` | Business contact information, call and WhatsApp actions, and booking assistance |
| `/profile` | Customer profile, edit action, and account menu |
| `/booking` | Booking form with GPS or manual address entry |
| `/booking/success/:bookingId` | Receipt for the current customer's saved request |
| `/booking/:bookingId` | Customer-scoped booking details and status timeline |
| `/settings` | Language preferences, account, legal, and app information |
| `/settings/edit-profile`, `/settings/account` | Profile editing and account information |
| `/settings/data-usage`, `/settings/delete-account` | Data usage and account deletion confirmation |

The application provider reads the stored language, onboarding status, and profile at startup. Root route guards advance setup after each successful save. A valid local profile opens the main tabs on subsequent launches. Opening a legal page keeps the registration form in the stack.

Customer names are trimmed and Indian mobile numbers are stored as `+91` followed by ten digits. Local profiles use UUIDs and UTC timestamps. AsyncStorage holds setup and profile data on this device. Future backend requests for customer records and bookings will require a backend-issued session, with separate admin access.

Home and Contact share the same business configuration. Set `EXPO_PUBLIC_BUSINESS_PHONE` in international format with a leading `+`. WhatsApp defaults to that number and can use a separate `EXPO_PUBLIC_BUSINESS_WHATSAPP` value.

## Account

Profile edits apply to future requests. Historical bookings retain the contact details saved when the request was created. Language changes apply across the app and persist in the customer's profile and language preference.

The in-app Privacy Policy and Terms are drafts for business approval before publication. The current account deletion adapter reports the operation as unavailable and keeps the local profile and bookings. A configured public deletion URL opens the business's request page.

## Booking

Booking requests use the saved customer profile. GPS capture is triggered by the customer, and a validated manual address also works. The form retains unsaved changes during the current app session. Submissions are saved as pending records in AsyncStorage under the customer's ID. Each submission has a UUID that is reused on retry. The receipt appears after a successful save and links to the existing My Bookings tab.

The booking service exposes creation and customer-scoped reads. A future FastAPI implementation can use the submission UUID as an idempotency key and return a server-issued booking ID. The local receipt reflects an on-device save.

My Bookings refreshes on focus and supports pull to refresh. Counters and filters use one customer-scoped snapshot. Details fetch by booking ID within the same customer scope and show the stored status and submission timestamp. New local requests stay pending until a future service can supply updated status.

## Extension points

- Keep route files in `app/` and place feature implementation in `src/features/`.
- Import shared controls from `src/components/` and design tokens from `src/theme/`. NativeWind and the React Native theme share `src/theme/palette.json`.
- Keep interface strings in both locale JSON files. The `useAppLanguage` hook switches the language and stores the preference with AsyncStorage. English is the initial default.
- Shared providers, state, localization, and runtime configuration live in `src/providers/`, `src/store/`, `src/locales/`, and `src/constants/`. Native assets are grouped in `assets/branding/`.
- Build future FastAPI clients in `src/services/api/`, with `resolveApiUrl` as the entry point for resolving endpoint paths. React Hook Form, Zod, and the Zod resolver are available for future form modules.
