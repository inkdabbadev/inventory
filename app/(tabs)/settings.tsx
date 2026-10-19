import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Empty, Field, IconBubble, LargeHeader, Row, Screen, SectionTitle, styles as ui } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { kvGet, kvSet } from '../../src/db/client';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { isCloudEnabled } from '../../src/lib/neon';
import { dashboardStats } from '../../src/services/inventory';
import { timeAgo } from '../../src/services/format';
import { conflicts, dismissConflict, syncNow } from '../../src/services/sync';
import { cmyk, colors, space, type } from '../../src/theme';

export default function Settings() {
  const [staff, setStaff] = useState(() => kvGet('staff_name') ?? '');
  const [stats, reloadStats] = useFocusQuery(dashboardStats);
  const [conflictList, reloadConflicts] = useFocusQuery(conflicts);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const saveName = () => {
    kvSet('staff_name', staff.trim() || null);
    toast('Name saved');
  };

  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncNow();
      toast(`Synced · ↑${r.pushedRows + r.pushedMovements} ↓${r.pulledRows}${r.conflicts ? ` · ${r.conflicts} conflict(s)` : ''}`, r.conflicts ? 'error' : 'success');
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      reloadStats();
      reloadConflicts();
    }
  };

  const lastSync = kvGet('last_sync_at');
  const cloudState = !isCloudEnabled ? 'Offline mode' : stats.pending ? `${stats.pending} waiting` : 'Up to date';

  return (
    <Screen tabs header={false}>
      <LargeHeader title="Settings" subtitle="Device & sync" />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconBubble icon={isCloudEnabled ? 'cloud-done' : 'phone-portrait'} color={isCloudEnabled ? colors.success : cmyk.cyan} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={type.headline}>{cloudState}</Text>
            <Text style={type.caption}>{lastSync ? `Last sync ${timeAgo(lastSync)}` : 'All data is stored on this device'}</Text>
          </View>
        </View>
      </Card>

      <SectionTitle>You</SectionTitle>
      <Card>
        <Field label="Your name" icon="person-outline" value={staff} onChangeText={setStaff} onEndEditing={saveName} placeholder="Recorded on every movement" returnKeyType="done" />
        <Button title="Save" variant="secondary" icon="checkmark" onPress={saveName} compact />
      </Card>

      <SectionTitle>Cloud sync</SectionTitle>
      <Card>
        {!isCloudEnabled ? (
          <Text style={ui.muted}>
            Add EXPO_PUBLIC_NEON_API_URL and EXPO_PUBLIC_NEON_SYNC_KEY to share inventory across phones. Until then, everything works offline.
          </Text>
        ) : (
          <>
            <Text style={[type.body, { marginBottom: space.xs }]}>Connected to Neon production</Text>
            <Text style={[type.caption, { marginBottom: space.md }]}>Syncs automatically on launch, reconnect, foreground, and every 30 seconds while open.</Text>
            <Button title="Sync now" icon="sync" onPress={sync} loading={busy} />
          </>
        )}
      </Card>

      <SectionTitle>Manage</SectionTitle>
      <Card padded={false}>
        <Row icon="grid" iconColor={cmyk.cyan} title="Categories & codes" subtitle="Groups, types and the label code guide" onPress={() => router.push('/categories')} />
        <Row icon="location" iconColor={cmyk.magenta} title="Locations" subtitle="Racks, shelves, hooks, bins" onPress={() => router.push('/locations')} />
        <Row icon="checkmark-done" iconColor={cmyk.cyan} title="Shelf audit" subtitle="Count and reconcile a location" onPress={() => router.push('/audit')} last />
      </Card>

      <SectionTitle>Sync conflicts · {conflictList.length}</SectionTitle>
      <Card padded={false}>
        {conflictList.length === 0 ? (
          <Empty icon="shield-checkmark-outline" text="No conflicts." />
        ) : (
          conflictList.map((c, i) => (
            <Row
              key={c.id}
              icon="warning"
              iconColor={colors.error}
              title={`${c.type} by ${c.staff}`}
              subtitle={`${timeAgo(c.created_at)} · ${c.sync_error}`}
              right={<Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => { dismissConflict(c.id); reloadConflicts(); }}>Dismiss</Text>}
              last={i === conflictList.length - 1}
            />
          ))
        )}
      </Card>
      <Text style={[ui.muted, { textAlign: 'center', marginTop: space.lg, color: colors.textFaint }]}>INK DABBA Inventory · v1.0</Text>
    </Screen>
  );
}
