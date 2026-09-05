import { Platform } from 'react-native';

const knownUserMaxAgeSeconds = 60 * 60 * 24 * 365 * 2;
const activeSessionMaxAgeSeconds = 60 * 60 * 24 * 30;

export function markKnownUser(): void {
  writeCookie('ct_known', knownUserMaxAgeSeconds);
}

export function markSessionActive(): void {
  writeCookie('ct_session', activeSessionMaxAgeSeconds);
}

export function clearSessionCookie(): void {
  writeCookie('ct_session', 0);
}

function writeCookie(name: 'ct_known' | 'ct_session', maxAgeSeconds: number): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const attributes = [
    `${name}=1`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];

  if (window.location.hostname === 'contracktor.app' || window.location.hostname.endsWith('.contracktor.app')) {
    attributes.push('Domain=.contracktor.app');
  }

  if (window.location.protocol === 'https:') {
    attributes.push('Secure');
  }

  document.cookie = attributes.join('; ');
}
