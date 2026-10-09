/**
 * Cloud configuration. The Firebase web config below is PUBLIC client configuration (it names the project; it does
 * not authorise anything: Authentication and Firestore Security Rules do that), so shipping it in the bundle is
 * normal. It lives in exactly one place. Any value can be overridden with a VITE_ variable (see .env.example).
 * Never put a service-account key or any admin credential in this project's front end.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export interface CloudConfig {
  /** False: the game is built with every cloud feature off and never touches the network for them. */
  enabled: boolean;
  /** Talk to the local Firebase Emulator Suite instead of the real project. */
  useEmulators: boolean;
  emulatorHost: string;
  authEmulatorPort: number;
  firestoreEmulatorPort: number;
  firebase: FirebaseWebConfig;
  /** reCAPTCHA site key for App Check, or null when App Check has not been set up. */
  appCheckSiteKey: string | null;
}

const DEFAULTS: FirebaseWebConfig = {
  apiKey: 'AIzaSyCdM-Vhcl9_Ja5yvnEgauy5caJ0R-FeL3c',
  authDomain: 'crazy-bhutan-hill-race.firebaseapp.com',
  projectId: 'crazy-bhutan-hill-race',
  storageBucket: 'crazy-bhutan-hill-race.firebasestorage.app',
  messagingSenderId: '568849730906',
  appId: '1:568849730906:web:725efb5e65879401047763',
  measurementId: 'G-JHW0FN7E6Z',
};

/** The project id used with the emulators: a "demo-" id can never reach (or be mistaken for) the real project. */
export const EMULATOR_PROJECT_ID = 'demo-crazy-bhutan-hill-race';

type Env = Record<string, string | undefined>;

const flag = (v: string | undefined, fallback: boolean): boolean => (v === undefined || v === '' ? fallback : v === '1' || v === 'true');

export function readCloudConfig(env: Env = import.meta.env as unknown as Env): CloudConfig {
  const useEmulators = flag(env.VITE_USE_EMULATORS, false);
  const pick = <K extends keyof FirebaseWebConfig>(k: K, envKey: string): string => env[envKey] || DEFAULTS[k];
  const firebase: FirebaseWebConfig = {
    apiKey: pick('apiKey', 'VITE_FIREBASE_API_KEY'),
    authDomain: pick('authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: useEmulators ? EMULATOR_PROJECT_ID : pick('projectId', 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: pick('storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: pick('messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: pick('appId', 'VITE_FIREBASE_APP_ID'),
    measurementId: pick('measurementId', 'VITE_FIREBASE_MEASUREMENT_ID'),
  };
  return {
    enabled: flag(env.VITE_CLOUD_ENABLED, true),
    useEmulators,
    emulatorHost: env.VITE_EMULATOR_HOST || '127.0.0.1',
    authEmulatorPort: 9099,
    firestoreEmulatorPort: 8080,
    firebase,
    appCheckSiteKey: env.VITE_APPCHECK_SITE_KEY || null,
  };
}
