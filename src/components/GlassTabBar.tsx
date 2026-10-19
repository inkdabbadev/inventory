import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, IconName, PressScale } from './ui';
import { colors, gradients, radius } from '../theme';

/** Minimal shape of the props the tab navigator passes to a custom tab bar. */
export interface TabBarLike {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

const ICONS: Record<string, { on: IconName; off: IconName; label: string }> = {
  index: { on: 'grid', off: 'grid-outline', label: 'Home' },
  inventory: { on: 'cube', off: 'cube-outline', label: 'Inventory' },
  projects: { on: 'briefcase', off: 'briefcase-outline', label: 'Projects' },
  settings: { on: 'settings', off: 'settings-outline', label: 'Settings' },
};

/** Floating frosted tab bar with a raised cyan→magenta scan button in the middle. */
export function GlassTabBar({ state, navigation }: TabBarLike) {
  const insets = useSafeAreaInsets();
  const tabs = state.routes.map((r, i) => {
    const meta = ICONS[r.name] ?? { on: 'ellipse', off: 'ellipse-outline', label: r.name };
    const active = state.index === i;
    return (
      <PressScale key={r.key} onPress={() => navigation.navigate(r.name)} style={styles.tab}>
        <View style={styles.tabInner}>
          <Ionicons name={active ? meta.on : meta.off} size={22} color={active ? colors.primary : colors.textMuted} />
          <Text style={[styles.label, active && { color: colors.text }]}>{meta.label}</Text>
          {active ? <View style={styles.activeDot} /> : null}
        </View>
      </PressScale>
    );
  });

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Glass radius={radius.xl} intensity={55} tint="rgba(12,12,22,0.45)" style={styles.bar}>
        <View style={styles.row}>
          {tabs.slice(0, 2)}
          <View style={styles.tab} />
          {tabs.slice(2)}
        </View>
      </Glass>
      <PressScale onPress={() => router.push('/scan')} style={[styles.fabWrap, { bottom: Math.max(insets.bottom, 12) + 22 }]}>
        <LinearGradient colors={gradients.cm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
          <Ionicons name="scan" size={28} color="#fff" />
        </LinearGradient>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: { borderColor: colors.borderStrong },
  row: { flexDirection: 'row', height: 66, alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 64 },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.textMuted, marginTop: 3 },
  activeDot: { position: 'absolute', bottom: -4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  fabWrap: { position: 'absolute', alignSelf: 'center', left: '50%', marginLeft: -32 },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#EC008C',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
