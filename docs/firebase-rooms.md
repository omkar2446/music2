# Firebase Realtime Database for listening rooms

Listening rooms are stored in Firebase Realtime Database so room state and playback updates are shared across serverless instances. The app uses the Firebase Admin SDK on the server; browser clients never receive the service-account key.

## Create the Firebase project

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Create a **Realtime Database** and copy its database URL.
3. In **Project settings → Service accounts**, create a private key. Keep the downloaded JSON private; do not commit it or paste it into chat.
4. Configure these server-only environment variables locally in `.env.local` and in the Vercel project:

   | Variable | Value |
   | --- | --- |
   | `FIREBASE_DATABASE_URL` | Realtime Database URL shown in Firebase |
   | `FIREBASE_PROJECT_ID` | `project_id` from the service-account JSON |
   | `FIREBASE_CLIENT_EMAIL` | `client_email` from the service-account JSON |
   | `FIREBASE_PRIVATE_KEY` | `private_key` from the service-account JSON |

   When entering `FIREBASE_PRIVATE_KEY` in Vercel, preserve its newlines. In a `.env.local` value, escaped `\n` sequences are also accepted.

5. In Vercel, add all four variables to the environments that deploy the app, then redeploy.

The Admin SDK bypasses Realtime Database Security Rules. Keep browser access denied in the database rules; all room reads and writes go through the app’s server routes.

## Check the setup

Open the Rooms page and create a room. A missing or invalid Firebase configuration returns a clear server error rather than falling back to process-local storage. Room records are written under `/rooms/{code}` and are shared across app instances.
