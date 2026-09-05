const safeMessages = [
  /authentication is required/i,
  /must be logged in/i,
  /permission is required/i,
  /set the hourly rate/i,
  /already running/i,
  /could not be read/i,
  /not available for this business/i,
];

export function getUserFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();

  if (!message) {
    return fallback;
  }

  const safeMarkerIndex = message.indexOf('CTX:');

  if (safeMarkerIndex >= 0) {
    const safeMessage = message.slice(safeMarkerIndex + 4).split('\n')[0]?.trim();

    return safeMessage || fallback;
  }

  return safeMessages.some((pattern) => pattern.test(message)) ? message : fallback;
}
