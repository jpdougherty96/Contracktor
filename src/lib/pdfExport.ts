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
    return { didOpen: false, uri: namedUri };
  }

  await Sharing.shareAsync(namedUri, {
    dialogTitle,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });

  return { didOpen: true, uri: namedUri };
}

export function sanitizePdfFileName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, ' ');

  return sanitized || 'conTRACKtor export';
}

export function openPdfOnWeb({
  bytes,
  fileBaseName,
}: {
  bytes: Uint8Array;
  fileBaseName: string;
}): { fileName: string } {
  const fileName = `${sanitizePdfFileName(fileBaseName)}.pdf`;
  const documentRef = globalThis.document;
  if (!documentRef) throw new Error('Document is unavailable.');
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  return { fileName };
}
