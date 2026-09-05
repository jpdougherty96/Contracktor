import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="noindex, nofollow" name="robots" />
        <meta content="#F5F1E8" name="theme-color" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
