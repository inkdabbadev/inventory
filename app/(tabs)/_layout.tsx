import { Tabs } from 'expo-router';
import { GlassTabBar, TabBarLike } from '../../src/components/GlassTabBar';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={(props) => <GlassTabBar {...(props as unknown as TabBarLike)} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
