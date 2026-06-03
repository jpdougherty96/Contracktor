const PASSWORD_RECOVERY_REQUESTED_KEY = 'contracktor:passwordRecoveryRequested';

export function hasPendingPasswordRecoveryRequest(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(PASSWORD_RECOVERY_REQUESTED_KEY) === 'true';
}

export function markPasswordRecoveryRequested(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PASSWORD_RECOVERY_REQUESTED_KEY, 'true');
}

export function clearPasswordRecoveryRequested(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(PASSWORD_RECOVERY_REQUESTED_KEY);
}
