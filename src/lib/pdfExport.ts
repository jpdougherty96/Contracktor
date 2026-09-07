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

export async function savePdfBytesOnWeb({
  bytes,
  fileBaseName,
}: {
  bytes: Uint8Array;
  fileBaseName: string;
}): Promise<{ didOpen: boolean; fileName: string }> {
  const fileName = `${sanitizePdfFileName(fileBaseName)}.pdf`;
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], { type: 'application/pdf' });
  const navigatorRef = globalThis.navigator;
  const file = typeof File === 'function'
    ? new File([blob], fileName, { type: 'application/pdf' })
    : null;

  if (
    file &&
    navigatorRef?.share &&
    typeof navigatorRef.canShare === 'function' &&
    navigatorRef.canShare({ files: [file] })
  ) {
    try {
      await navigatorRef.share({ files: [file], title: fileName });
      return { didOpen: true, fileName };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { didOpen: false, fileName };
      }
      // A browser can reject Web Share when transient activation expires while
      // the PDF is generated. Fall back to a normal file download in that case.
    }
  }

  const documentRef = globalThis.document;
  if (!documentRef) throw new Error('Document is unavailable.');
  const objectUrl = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  return { didOpen: true, fileName };
}
