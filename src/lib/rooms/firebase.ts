import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const APP_NAME = "os-vibes-rooms";

export class FirebaseRoomConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseRoomConfigError";
  }
}

export function getFirebaseRoomDatabase() {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!databaseUrl || !projectId || !clientEmail || !privateKey) {
    throw new FirebaseRoomConfigError(
      "Firebase rooms are not configured. Set FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    );
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new FirebaseRoomConfigError("FIREBASE_DATABASE_URL must be an absolute URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FirebaseRoomConfigError("FIREBASE_DATABASE_URL must use HTTP or HTTPS.");
  }
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new FirebaseRoomConfigError("FIREBASE_PRIVATE_KEY is not a valid service-account key.");
  }

  const existingApp = getApps().find((app) => app.name === APP_NAME);
  const app =
    existingApp ??
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
        databaseURL: url.toString(),
      },
      APP_NAME,
    );

  return getDatabase(app);
}
