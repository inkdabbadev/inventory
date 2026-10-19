import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Empty, Field, IconBubble, LargeHeader, Row, Screen, SectionTitle, styles as ui } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { kvGet, kvSet } from '../../src/db/client';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { isCloudEnabled, supabase } from '../../src/lib/supabase';
import { dashboardStats } from '../../src/services/inventory';
import { timeAgo } from '../../src/services/format';
import { conflicts, dismissConflict, syncNow } from '../../src/services/sync';
import { cmyk, colors, space, type } from '../../src/theme';

export default function Settings() {
  const [staff, setStaff] = useState(() => kvGet('staff_name') ?? '');
  const [stats, reloadStats] = useFocusQuery(dashboardStats);
  const [conflictList, reloadConflicts] = useFocusQuery(conflicts);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUserEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const saveName = () => {
    kvSet('staff_name', staff.trim() || null);
    toast('Name saved');
  };

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert('Sign in failed', error.message);
    else toast('Signed in');
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
  const cloudState = !isCloudEnabled ? 'Offline mode' : userEmail ? (stats.pending ? `${stats.pending} waiting` : 'Up to date') : 'Signed out';

  return (
    <Screen tabs header={false}>
      <LargeHeader title="Settings" subtitle="Device & sync" />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconBubble icon={isCloudEnabled && userEmail ? 'cloud-done' : 'phone-portrait'} color={isCloudEnabled && userEmail ? colors.success : cmyk.cyan} size={46} />
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
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env to share inventory across phones. Until then, everything works offline.
          </Text>
        ) : userEmail ? (
          <>
            <Text style={[type.body, { marginBottom: space.md }]}>Signed in as <Text style={{ fontWeight: '800' }}>{userEmail}</Text></Text>
            <Button title="Sync now" icon="sync" onPress={sync} loading={busy} />
            <Button title="Sign out" variant="ghost" onPress={() => supabase!.auth.signOut()} style={{ marginTop: space.sm }} />
          </>
        ) : (
          <>
            <Field label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
            <Button title="Sign in" icon="log-in-outline" onPress={signIn} loading={busy} disabled={!email || !password} />
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
