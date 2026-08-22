import { Alert, Platform } from 'react-native';

type ConfirmActionOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  message: string;
  title: string;
};

export function confirmAction({
  cancelLabel = 'Keep editing',
  confirmLabel = 'Discard',
  destructive = true,
  message,
  title,
}: ConfirmActionOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        onPress: () => resolve(false),
        style: 'cancel',
        text: cancelLabel,
      },
      {
        onPress: () => resolve(true),
        style: destructive ? 'destructive' : 'default',
        text: confirmLabel,
      },
    ]);
  });
}
