# Google Play listing and Data Safety preparation

## Store listing

The copy below describes the current on-device experience. Supply final business details and approved copy for the release in each supported listing language. [Play Console listing fields](https://support.google.com/googleplay/android-developer/answer/9859152)

| Field | Draft or input needed |
| --- | --- |
| App name, up to 30 characters | Solar Care, provisional |
| Short description, up to 80 characters | Prepare solar panel cleaning requests and view saved bookings. |
| Full description, up to 4,000 characters | Solar Care helps customers request solar panel cleaning. Choose GPS or enter the installation address, add access instructions, and review the booking details. Track requests, update your contact details, and contact the business for help. English and Malayalam are available. |
| Category | Confirm the appropriate app category with the business |
| Support email | Business to supply |
| Website | Business to supply |
| Privacy policy URL | Business to publish an approved policy at a public HTTPS address |
| Account deletion URL | Business to supply a working request page when applicable |

## Store assets

Place final files under `assets/store/`. Capture screenshots from the genuine release app with non-personal demonstration data. The launcher artwork in `assets/branding/` remains provisional.

| Asset | Location | Play requirements |
| --- | --- | --- |
| Store icon | `assets/store/play-icon.png` | 512 × 512 PNG, up to 1 MB |
| Phone screenshots | `assets/store/phone/` | At least two genuine screenshots. JPEG or 24-bit PNG without alpha, with each dimension from 320 to 3840 pixels and the long side at most twice the short side |
| Feature graphic | `assets/store/feature-graphic.png` | 1024 × 500 JPEG or 24-bit PNG without alpha |
| Optional promotional media | `assets/store/promo/` | Supply if used by the final listing or selected promotion |

[Google Play preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151)

## Data Safety reference

Use this inventory when completing the form for the shipped binary and its backend. The entries below describe app behavior. Google Play classifications depend on the final data transfers, purposes, recipients, SDK behavior, and any applicable exceptions. [Google Play Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)

| Data | Current behavior | Production disclosure inputs |
| --- | --- | --- |
| Name, customer ID, primary and optional alternate phone | FastAPI stores the account and snapshots contact details on booking submission | Account and contact data, purposes, retention, and recipients |
| Service address and optional GPS coordinates | FastAPI receives the address during coverage checks, address saves and booking submissions. Foreground location and reverse geocoding run when chosen. Maps receives coordinates when opened | Location precision, geocoder behavior, business recipients, and retention |
| Booking status, reference, timestamps, and user instructions | Stored in PostgreSQL and displayed in booking history | Operational access, handling of optional free text, and retention |
| Language choice and onboarding completion | Saved locally to maintain app preferences | Any final preference synchronization or analytics use |
| Phone, WhatsApp, website, and legal links | Open a user-selected system or external service. The app passes the configured destination number or URL | Final destinations and any information passed to external providers |

Expo Location uses the operating system's location and geocoding facilities. AsyncStorage persists language and onboarding. SecureStore stores the installation credential and rotating tokens. Expo Crypto generates credentials and booking retry identifiers. The final declaration should reflect the SDK versions and actual data flows in the shipped binary.

## Privacy and account deletion

The in-app Privacy Policy and Terms are drafts. The business must supply approved public documents that reflect the final services, data handling, retention, and contact information.

If the final account model falls under Google Play's account-deletion requirements, the business needs an in-app path and a functional public web path for requesting deletion of the account and associated data. The final policy must explain any retained records and their basis. The current screen can link to a configured page, and the in-app operation reports that backend deletion is unavailable. [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
