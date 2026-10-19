import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scanner } from '../src/components/Scanner';
import { Backdrop, Button, Card, Empty, Glass, IconBubble, IconName, QtyInput, SectionTitle } from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { applyAction, CartLine, fmtQty, fullName, getLocation, InventoryError, locationContents, resolveScan } from '../src/services/inventory';
import type { AssetView, Location } from '../src/domain/types';
import { cmyk, colors, radius, space, type } from '../src/theme';

/**
 * Shelf audit: scan the location QR, then scan everything physically there.
 * Shows missing assets, unexpected ones (offers to move them here) and lets you
 * enter counted quantities for stock, which are saved as adjustments.
 */
export default function Audit() {
  const params = useLocalSearchParams<{ locationId?: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [location, setLocation] = useState<Location | null>(() => (params.locationId ? getLocation(params.locationId) : null));
  const [found, setFound] = useState<Set<string>>(new Set());
  const [unexpected, setUnexpected] = useState<AssetView[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const expected = useMemo(() => (location ? locationContents(location.id) : { assets: [], lots: [] }), [location]);
  const expectedAssets = expected.assets.filter((a) => a.status === 'available');
  const missing = expectedAssets.filter((a) => !found.has(a.id));
  const foundExpected = expectedAssets.length - missing.length;
  const progress = expectedAssets.length ? foundExpected / expectedAssets.length : 1;

  const onScan = (value: string) => {
    const r = resolveScan(value);
    if (!location) {
      if (r.kind === 'location') {
        setLocation(r.item);
        toast(`Auditing ${r.item.name}`, 'info');
      } else toast('Scan a location QR first', 'error');
      return;
    }
    if (r.kind === 'asset') {
      setFound((s) => new Set(s).add(r.item.id));
      if (r.item.location_id !== location.id) {
        setUnexpected((u) => (u.some((x) => x.id === r.item.id) ? u : [...u, r.item]));
        toast(`${r.item.code} belongs to ${r.item.location_name ?? 'no location'}`, 'info');
      }
    } else if (r.kind === 'lot') toast(`${r.item.code}: enter the counted quantity`, 'info');
    else if (r.kind === 'location') toast('Finish this audit first', 'error');
    else toast(`Unknown code: ${r.value}`, 'error');
  };

  const finish = () => {
    try {
      const moves: CartLine[] = unexpected.filter((u) => u.status !== 'checked_out').map((u) => ({ entityType: 'asset', entityId: u.id }));
      if (moves.length) applyAction('transfer', moves, { locationId: location!.id, notes: 'Found during audit' });
      for (const [lotId, value] of Object.entries(counts)) {
        if (value.trim() === '') continue;
        applyAction('adjust', [{ entityType: 'lot', entityId: lotId, quantity: Number(value.replace(',', '.')) }], { notes: `Audit at ${location!.name}` });
      }
      Alert.alert(
        'Audit saved',
        `${found.size} scanned · ${missing.length} missing · ${moves.length} moved here${missing.length ? `\n\nMissing:\n${missing.map((m) => m.code).join(', ')}` : ''}`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e) {
      toast(e instanceof InventoryError ? e.message : String(e), 'error');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={{ height: '36%' }}>
        <Scanner onScan={onScan} hint={location ? `Auditing ${location.name}` : 'Scan a location QR to begin'} compact />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!location ? (
          <Card>
            <Empty icon="location-outline" text="Scan the QR label on a rack, shelf, hook or bin to start counting." />
          </Card>
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <IconBubble icon="location" color={cmyk.magenta} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={type.title}>{location.name}</Text>
                  <Text style={type.caption}>{foundExpected}/{expectedAssets.length} expected assets found · {found.size} scanned</Text>
                </View>
              </View>
              <View style={styles.track}>
                <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: progress === 1 ? colors.success : cmyk.cyan, borderRadius: 4 }} />
              </View>
            </Card>

            <SectionTitle>Missing · {missing.length}</SectionTitle>
            <Glass radius={radius.lg}>
              {missing.length === 0 ? (
                <Line icon="checkmark-circle" color={colors.success} text="All expected assets found" />
              ) : (
                missing.map((a) => <Line key={a.id} icon="help-circle" color={colors.error} text={`${a.code} · ${fullName(a)}`} />)
              )}
            </Glass>

            <SectionTitle>Not expected here · {unexpected.length}</SectionTitle>
            <Glass radius={radius.lg}>
              {unexpected.length === 0 ? (
                <Line icon="checkmark-circle" color={colors.textMuted} text="None" />
              ) : (
                unexpected.map((a) => (
                  <Line
                    key={a.id}
                    icon="swap-horizontal"
                    color={cmyk.yellow}
                    text={`${a.code} · ${a.status === 'checked_out' ? `checked out to ${a.project_name}` : `from ${a.location_name ?? 'nowhere'} → move here`}`}
                  />
                ))
              )}
            </Glass>

            <SectionTitle>Stock counts</SectionTitle>
            {expected.lots.length === 0 ? (
              <Text style={type.caption}>No stock lots at this location.</Text>
            ) : (
              expected.lots.map((l) => (
                <Glass key={l.id} radius={radius.md} style={{ marginBottom: space.sm }}>
                  <View style={styles.countRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.headline}>{fullName(l)}</Text>
                      <Text style={type.caption}>{l.code} · system {fmtQty(l.quantity)} {l.unit}</Text>
                    </View>
                    <QtyInput placeholder="count" value={counts[l.id] ?? ''} onChangeText={(t) => setCounts((c) => ({ ...c, [l.id]: t }))} />
                  </View>
                </Glass>
              ))
            )}

            <Button title="Finish audit" icon="checkmark-done" onPress={finish} style={{ marginTop: space.lg }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Line({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={styles.lineRow}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceStrong, overflow: 'hidden', marginTop: space.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  countRow: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.md },
});
