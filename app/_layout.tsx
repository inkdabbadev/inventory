import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { migrate } from '../src/db/client';
import { CartProvider } from '../src/store/cart';
import { ToastProvider } from '../src/components/Toast';
import { colors } from '../src/theme';

// Synchronous: tables exist before the first screen queries them.
migrate();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ToastProvider>
          <CartProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerTransparent: true,
                headerBlurEffect: 'systemChromeMaterialDark',
                headerStyle: Platform.OS === 'android' ? { backgroundColor: 'rgba(7,7,12,0.92)' } : undefined,
                headerShadowVisible: false,
                headerTintColor: colors.primary,
                headerTitleStyle: { color: colors.text, fontWeight: '700' },
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
              <Stack.Screen name="scan" options={{ title: 'Scan', animation: 'fade_from_bottom' }} />
              <Stack.Screen name="add" options={{ title: 'New item' }} />
              <Stack.Screen name="cart" options={{ title: 'Multi-scan' }} />
              <Stack.Screen name="action" options={{ presentation: "modal", headerShown: false, animation: "slide_from_bottom" }} />
              <Stack.Screen name="asset/[id]" options={{ title: 'Asset' }} />
              <Stack.Screen name="lot/[id]" options={{ title: 'Stock' }} />
              <Stack.Screen name="locations/index" options={{ title: 'Locations' }} />
              <Stack.Screen name="locations/[id]" options={{ title: 'Location' }} />
              <Stack.Screen name="projects/[id]" options={{ title: 'Project' }} />
              <Stack.Screen name="audit" options={{ title: 'Shelf audit' }} />
              <Stack.Screen name="import" options={{ title: "Import" }} />
              <Stack.Screen name="categories" options={{ title: "Categories" }} />
            </Stack>
          </CartProvider>
        </ToastProvider>
      </View>
    </SafeAreaProvider>
  );
}
