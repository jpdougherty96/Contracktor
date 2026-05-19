import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function createAndSharePdf({
  dialogTitle,
  fileBaseName,
  html,
}: {
  dialogTitle: string;
  fileBaseName: string;
  html: string;
}) {
  const file = await Print.printToFileAsync({
    html,
    base64: false,
  });
  const namedUri = `${FileSystem.cacheDirectory}${sanitizePdfFileName(fileBaseName)}.pdf`;

  await FileSystem.copyAsync({
    from: file.uri,
    to: namedUri,
  });

  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    return namedUri;
  }

  await Sharing.shareAsync(namedUri, {
    dialogTitle,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });

  return namedUri;
}

export function sanitizePdfFileName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, ' ');

  return sanitized || 'conTRACKtor export';
}
