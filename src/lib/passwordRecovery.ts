const PASSWORD_RECOVERY_REQUESTED_KEY = 'contracktor:passwordRecoveryRequested';

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
