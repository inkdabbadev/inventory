import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, IconName } from './ui';
import { colors, space } from '../theme';

type Kind = 'success' | 'error' | 'info';
const ICON: Record<Kind, { icon: IconName; color: string }> = {
  success: { icon: 'checkmark-circle', color: colors.success },
  error: { icon: 'alert-circle', color: colors.error },
  info: { icon: 'information-circle', color: colors.primary },
};

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {});

/** Non-blocking glass toast (Dynamic-Island style) for confirmations; Alerts stay for decisions. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ text: string; kind: Kind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(
    (text: string, kind: Kind = 'success') => {
      clearTimeout(timer.current);
      setToast({ text, kind });
      Haptics.notificationAsync(kind === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      }, 2200);
    },
    [anim],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: insets.top + 6, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
          ]}
        >
          <Glass radius={999} intensity={60} tint="rgba(10,10,18,0.55)">
            <View style={styles.inner}>
              <Ionicons name={ICON[toast.kind].icon} size={20} color={ICON[toast.kind].color} />
              <Text style={styles.text} numberOfLines={2}>{toast.text}</Text>
            </View>
          </Glass>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center', zIndex: 1000 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12 },
  text: { color: colors.text, fontWeight: '600', fontSize: 14, flexShrink: 1 },
});
