import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Empty, Glass, IconBubble, IconButton, IconName, LargeHeader, PressScale, Row, Screen, SectionTitle } from '../../src/components/ui';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { kvGet } from '../../src/db/client';
import { currentStaff, dashboardStats, recentMovements } from '../../src/services/inventory';
import { describeMovement, MOVEMENT_ICON, timeAgo } from '../../src/services/format';
import { useCart } from '../../src/store/cart';
import { useToast } from '../../src/components/Toast';
import { supabase } from '../../src/lib/supabase';
import { syncNow } from '../../src/services/sync';
import { cmyk, colors, gradients, radius, space, type } from '../../src/theme';

const ACTIONS: { label: string; icon: IconName; color: string; href: string }[] = [
  { label: 'Add item', icon: 'add', color: cmyk.cyan, href: '/add' },
  { label: 'Issue', icon: 'arrow-up', color: cmyk.yellow, href: '/cart?mode=issue' },
  { label: 'Return', icon: 'arrow-down', color: colors.success, href: '/cart?mode=return' },
  { label: 'Categories', icon: 'grid', color: cmyk.magenta, href: '/categories' },
  { label: 'Locations', icon: 'location', color: cmyk.cyan, href: '/locations' },
  { label: 'Import', icon: 'cloud-upload', color: cmyk.yellow, href: '/import' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const [stats, reloadStats] = useFocusQuery(dashboardStats);
  const [recent, reloadRecent] = useFocusQuery(() => recentMovements(8));
  const toast = useToast();

  /** Pull to refresh: syncs with the cloud when signed in, otherwise just reloads. */
  const refresh = async () => {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          const r = await syncNow();
          toast(`Synced · ↑${r.pushedRows + r.pushedMovements} ↓${r.pulledRows}`);
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), 'error');
        }
      }
    }
    reloadStats();
    reloadRecent();
  };
  const { entries } = useCart();
  const staff = kvGet('staff_name') ? currentStaff() : null;
  const total = Math.max(stats.total, 1);

  return (
    <Screen tabs header={false} onRefresh={refresh}>
      <LargeHeader
        subtitle={`${greeting()}${staff ? `, ${staff}` : ''}`}
        title="INK Inventory"
        right={
          entries.length > 0 ? (
            <PressScale onPress={() => router.push('/cart')}>
              <LinearGradient colors={gradients.my} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cartPill}>
                <Ionicons name="cart" size={16} color="#fff" />
                <Text style={styles.cartText}>{entries.length}</Text>
              </LinearGradient>
            </PressScale>
          ) : (
            <IconButton icon="add" color={colors.primary} onPress={() => router.push('/add')} />
          )
        }
      />

      <PressScale onPress={() => router.push('/inventory?focus=1')} style={{ marginBottom: space.md }}>
        <Glass radius={radius.md}>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <Text style={styles.searchText}>Search items, codes, categories</Text>
          </View>
        </Glass>
      </PressScale>

      {/* Hero: fleet overview with CMY distribution bar */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={type.overline}>Total assets</Text>
            <Text style={styles.heroNumber}>{stats.total}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={type.overline}>Stock lots</Text>
            <Text style={[type.title, { color: cmyk.cyan }]}>{stats.lots}</Text>
          </View>
        </View>
        <View style={styles.bar}>
          <View style={{ flex: stats.available / total || 0, backgroundColor: colors.success }} />
          <View style={{ flex: stats.checkedOut / total || 0, backgroundColor: cmyk.yellow }} />
          <View style={{ flex: stats.maintenance / total || 0, backgroundColor: cmyk.magenta }} />
          {stats.total === 0 ? <View style={{ flex: 1, backgroundColor: colors.surfaceStrong }} /> : null}
        </View>
        <View style={styles.legend}>
          <Legend color={colors.success} label="Available" value={stats.available} />
          <Legend color={cmyk.yellow} label="Checked out" value={stats.checkedOut} />
          <Legend color={cmyk.magenta} label="Maintenance" value={stats.maintenance} />
        </View>
      </Card>

      {stats.overdue > 0 ? (
        <Card onPress={() => router.push('/inventory?filter=checked_out')} tint="rgba(255,230,0,0.08)" style={{ borderColor: 'rgba(255,230,0,0.35)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <IconBubble icon="alarm" color={cmyk.yellow} />
            <View style={{ flex: 1 }}>
              <Text style={type.headline}>{stats.overdue} overdue</Text>
              <Text style={type.caption}>Equipment past its expected return date</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Card>
      ) : null}

      {/* Scan CTA */}
      <PressScale onPress={() => router.push('/scan')}>
        <LinearGradient colors={gradients.cm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scan}>
          <View style={styles.scanIcon}>
            <Ionicons name="qr-code" size={30} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan an item</Text>
            <Text style={styles.scanSub}>QR or barcode · view, issue, return</Text>
          </View>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </LinearGradient>
      </PressScale>

      <View style={styles.grid}>
        {ACTIONS.map((a) => (
          <PressScale key={a.label} onPress={() => router.push(a.href as never)} style={styles.gridItem}>
            <Glass radius={radius.lg}>
              <View style={styles.action}>
                <IconBubble icon={a.icon} color={a.color} size={42} />
                <Text style={styles.actionLabel}>{a.label}</Text>
              </View>
            </Glass>
          </PressScale>
        ))}
      </View>

      <SectionTitle
        right={
          stats.pending > 0 ? (
            <PressScale onPress={() => router.push('/settings')}>
              <View style={styles.syncPill}>
                <Ionicons name="cloud-upload-outline" size={13} color={cmyk.yellow} />
                <Text style={{ color: cmyk.yellow, fontWeight: '700', fontSize: 12 }}>{stats.pending} unsynced</Text>
              </View>
            </PressScale>
          ) : null
        }
      >
        Recent activity
      </SectionTitle>
      <Card padded={false}>
        {recent.length === 0 ? (
          <Empty icon="sparkles-outline" text="No activity yet. Add your first item to get started." />
        ) : (
          recent.map((m, i) => (
            <Row
              key={m.id}
              icon={MOVEMENT_ICON[m.type]?.icon}
              iconColor={MOVEMENT_ICON[m.type]?.color}
              title={m.label ?? 'Item'}
              subtitle={`${describeMovement(m)} · ${m.staff}`}
              right={<Text style={styles.time}>{timeAgo(m.created_at)}</Text>}
              onPress={() => router.push(`/${m.entity_type}/${m.entity_id}`)}
              last={i === recent.length - 1}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={[type.caption, { fontSize: 12 }]}>{label}</Text>
      </View>
      <Text style={[type.headline, { marginTop: 2, marginLeft: 14 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroNumber: { fontSize: 52, fontWeight: '800', color: colors.text, letterSpacing: -1.5, lineHeight: 58 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: space.md, gap: 2 },
  legend: { flexDirection: 'row', marginTop: space.md },
  scan: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.lg, padding: space.xl, marginBottom: space.md, shadowColor: cmyk.magenta, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  scanIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  scanTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  scanSub: { color: 'rgba(255,255,255,0.85)', marginTop: 3, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridItem: { width: '33.333%', padding: 5 },
  action: { alignItems: 'center', paddingVertical: space.lg, gap: 8 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  cartPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 20 },
  cartText: { color: '#fff', fontWeight: '800' },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,230,0,0.12)' },
  time: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: space.lg },
  searchText: { color: colors.textFaint, fontSize: 15, fontWeight: '500' },
});
