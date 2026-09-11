const PASSWORD_RECOVERY_REQUESTED_KEY = 'contracktor:passwordRecoveryRequested';

export function isPasswordRecoveryUrl(value?: string): boolean {
  const href = value ?? getCurrentHref();

  if (!href) {
    return false;
  }

  const url = new URL(href, 'https://app.contracktor.app');
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

  return (
    url.searchParams.get('authFlow') === 'password-recovery' ||
    hashParams.get('authFlow') === 'password-recovery' ||
    url.searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery' ||
    href.includes('type=recovery')
  );
}

export function preservePasswordRecoveryRequestFromUrl(): boolean {
  if (!isPasswordRecoveryUrl()) {
    return false;
  }

  markPasswordRecoveryRequested();
  return true;
}

export function hasPendingPasswordRecoveryRequest(): boolean {
  const storage = getPasswordRecoveryStorage();

  if (!storage) {
    return false;
  }

  return storage.getItem(PASSWORD_RECOVERY_REQUESTED_KEY) === 'true';
}

export function markPasswordRecoveryRequested(): void {
  const storage = getPasswordRecoveryStorage();

  if (!storage) {
    return;
  }

  storage.setItem(PASSWORD_RECOVERY_REQUESTED_KEY, 'true');
}

export function clearPasswordRecoveryRequested(): void {
  const storage = getPasswordRecoveryStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(PASSWORD_RECOVERY_REQUESTED_KEY);
}

function getPasswordRecoveryStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function getCurrentHref(): string | null {
  if (typeof window === 'undefined' || !window.location?.href) {
    return null;
  }

  return window.location.href;
}
