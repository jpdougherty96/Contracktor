import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/styles/theme';

type Notice = {
  id: number;
  message: string;
};

type AppNoticeContextValue = {
  showNotice: (message: string) => void;
};

const AppNoticeContext = createContext<AppNoticeContextValue | null>(null);

export function AppNoticeProvider({ children }: { children: ReactNode }) {
  const nextNoticeId = useRef(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = useCallback((message: string) => {
    nextNoticeId.current += 1;
    setNotice({ id: nextNoticeId.current, message });
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timeoutId);
  }, [notice]);

  const value = useMemo(() => ({ showNotice }), [showNotice]);

  return (
    <AppNoticeContext.Provider value={value}>
      <View style={styles.appShell}>
        {children}
        {notice ? (
          <View pointerEvents="none" style={styles.toastLayer}>
            <View accessibilityLiveRegion="polite" style={styles.toast}>
              <Text style={styles.toastText}>{notice.message}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </AppNoticeContext.Provider>
  );
}

export function useAppNotice(): AppNoticeContextValue {
  const context = useContext(AppNoticeContext);

  if (!context) {
    throw new Error('useAppNotice must be used inside AppNoticeProvider.');
  }

  return context;
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  toast: {
    backgroundColor: colors.primaryGreen,
    borderRadius: 10,
    maxWidth: 460,
    paddingHorizontal: 18,
    paddingVertical: 12,
    width: '100%',
  },
  toastLayer: {
    alignItems: 'center',
    bottom: 24,
    left: 20,
    position: 'absolute',
    right: 20,
    zIndex: 100,
  },
  toastText: {
    color: colors.warmWhite,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
