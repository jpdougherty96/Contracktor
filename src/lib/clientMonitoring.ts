import { Platform } from 'react-native';

export type SanitizedClientError = {
  category: string;
  fingerprint: string;
  platform: string;
  source: string;
  stack: string | null;
};

type ClientErrorReporter = (event: SanitizedClientError) => void;

let activeReporter: ClientErrorReporter | null = null;

export function registerClientErrorReporter(reporter: ClientErrorReporter | null): void {
  activeReporter = reporter;
}

export function reportClientError(error: unknown, source: string): SanitizedClientError {
  const category = getErrorCategory(error);
  const safeSource = sanitizeIdentifier(source) || 'unknown';
  const event: SanitizedClientError = {
    category,
    fingerprint: `${safeSource}:${category}`,
    platform: Platform.OS,
    source: safeSource,
    stack: sanitizeStack(error instanceof Error ? error.stack : undefined),
  };

  activeReporter?.(event);

  if (__DEV__) {
    console.error(`[${event.fingerprint}]`, error);
  }

  return event;
}

function getErrorCategory(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeIdentifier(error.name) || 'Error';
  }

  return typeof error;
}

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
}

function sanitizeStack(stack: string | undefined): string | null {
  if (!stack) {
    return null;
  }

  const stackLines = stack.split('\n').slice(1, 21);
  return stackLines
    .map((line) =>
      line
        .replace(/[A-Z]:\\[^\s)]+/gi, '[path]')
        .replace(/\/(?:Users|home)\/[^\s)]+/g, '[path]')
        .replace(/https?:\/\/[^\s)]+/g, '[url]')
        .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}/g, '[id]')
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    )
    .join('\n');
}
