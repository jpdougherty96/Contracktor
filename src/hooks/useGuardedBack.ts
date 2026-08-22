import { useCallback, useContext, useEffect } from 'react';
import { Platform } from 'react-native';

import { BackNavigationContext } from '@/src/contexts/BackNavigationContext';
import { confirmAction } from '@/src/lib/confirmAction';

type UseGuardedBackOptions = {
  confirmLabel?: string;
  hasUnsavedChanges: boolean;
  isBusy?: boolean;
  message?: string;
  onBack: () => void;
  title?: string;
};

export function useGuardedBack({
  confirmLabel = 'Discard',
  hasUnsavedChanges,
  isBusy = false,
  message = 'Your unsaved changes will be lost.',
  onBack,
  title = 'Discard changes?',
}: UseGuardedBackOptions): () => void {
  const registerBackHandler = useContext(BackNavigationContext);
  const handleBack = useCallback(async () => {
    if (isBusy) {
      return false;
    }

    if (
      hasUnsavedChanges &&
      !(await confirmAction({ confirmLabel, message, title }))
    ) {
      return false;
    }

    onBack();
    return true;
  }, [confirmLabel, hasUnsavedChanges, isBusy, message, onBack, title]);

  useEffect(() => {
    if (!registerBackHandler) {
      return;
    }

    return registerBackHandler(handleBack);
  }, [handleBack, registerBackHandler]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (!hasUnsavedChanges || isBusy || typeof window === 'undefined') {
        return;
      }

      const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault();
        event.returnValue = '';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }

  }, [hasUnsavedChanges, isBusy]);

  return () => {
    void handleBack();
  };
}
