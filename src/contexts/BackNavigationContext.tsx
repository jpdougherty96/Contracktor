import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { BackHandler, Platform } from 'react-native';

type BackRequestHandler = () => boolean | void | Promise<boolean | void>;
type RegisterBackHandler = (handler: BackRequestHandler) => () => void;

export const BackNavigationContext = createContext<RegisterBackHandler | null>(null);

type ScreenBackProviderProps = {
  children: ReactNode;
  onBack?: BackRequestHandler | null;
  screenKey: string;
};

export function ScreenBackProvider({
  children,
  onBack = null,
  screenKey,
}: ScreenBackProviderProps) {
  const defaultHandlerRef = useRef<BackRequestHandler | null>(onBack);
  const activeHandlerRef = useRef<BackRequestHandler | null>(onBack);

  useEffect(() => {
    defaultHandlerRef.current = onBack;
    activeHandlerRef.current = onBack;
  }, [onBack]);

  const registerHandler = useCallback<RegisterBackHandler>((handler) => {
    activeHandlerRef.current = handler;

    return () => {
      if (activeHandlerRef.current === handler) {
        activeHandlerRef.current = defaultHandlerRef.current;
      }
    };
  }, []);

  useEffect(() => {
    if (!onBack || Platform.OS === 'web') {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void activeHandlerRef.current?.();
      return true;
    });

    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    if (!onBack || Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const state = { contracktorScreen: screenKey };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = async () => {
      const handled = await activeHandlerRef.current?.();

      if (handled === false) {
        window.history.pushState(state, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onBack, screenKey]);

  const contextValue = useMemo(() => registerHandler, [registerHandler]);

  return (
    <BackNavigationContext.Provider value={contextValue}>
      {children}
    </BackNavigationContext.Provider>
  );
}
