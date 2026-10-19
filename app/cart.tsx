import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scanner } from '../src/components/Scanner';
import { Backdrop, BottomBar, Button, CONTROL_HEIGHT, Empty, Glass, IconBubble, PressScale, QtyInput, Segmented, StatusBadge, useHeaderSpace } from '../src/components/ui';
import { fmtQty, fullName, resolveScan } from '../src/services/inventory';
import { groupStyle } from '../src/domain/taxonomy';
import { CartEntry, useCart } from '../src/store/cart';
import { colors, radius, space, type } from '../src/theme';

type Mode = 'issue' | 'return';
type Status = { text: string; ok: boolean } | null;

/** Space the floating bottom bar occupies, so the last row is never hidden behind it. */
const BAR_SPACE = CONTROL_HEIGHT + space.md * 2;

/**
 * Multi-scan Issue / Return: live scanner on top, running list below.
 * Scan 10 cables, review, then issue (or return) all of them in one transaction.
 */
export default function CartScreen() {
  const params = useLocalSearchParams<{ mode?: Mode; projectId?: string; review?: string }>();
  const insets = useSafeAreaInsets();
  const headerSpace = useHeaderSpace();
  const [mode, setMode] = useState<Mode>(params.mode ?? 'issue');
  const [status, setStatus] = useState<Status>(null);
  const cart = useCart();
  const listRef = useRef<FlatList<CartEntry>>(null);
  const returnReview = params.review === '1' && mode === 'return';

  const flash = (s: Status) => setStatus(s);
  const clearStatus = useCallback(() => setStatus(null), []);

  const onScan = (value: string) => {
    const r = resolveScan(value);
    if (r.kind === 'unknown') return flash({ text: 'Not in inventory', ok: false });
    if (r.kind === 'location') return flash({ text: `${r.item.name} is a location`, ok: false });
    if (r.kind === 'asset') {
      if (mode === 'issue' && r.item.status !== 'available') return flash({ text: `${r.item.code} is ${r.item.status.replace('_', ' ')}`, ok: false });
      if (mode === 'return' && r.item.status !== 'checked_out') return flash({ text: `${r.item.code} is not checked out`, ok: false });
      const res = cart.add({ entityType: 'asset', item: r.item });
      flash(res === 'added' ? { text: `Added ${fullName(r.item)}`, ok: true } : { text: `${r.item.code} already in list`, ok: false });
    } else {
      if (mode === 'return') return flash({ text: 'Stock isn’t returned — use Restock', ok: false });
      const res = cart.add({ entityType: 'lot', item: r.item, quantity: 1 });
      flash(res === 'added' ? { text: `Added ${fullName(r.item)} · set qty`, ok: true } : { text: `${r.item.code} already in list`, ok: false });
    }
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const switchMode = (m: Mode) => {
    if (m !== mode && cart.entries.length) cart.clear();
    setMode(m);
    setStatus(null);
  };

  const summary = useMemo(() => {
    const assets = cart.entries.filter((e) => e.entityType === 'asset').length;
    const lots = cart.entries.length - assets;
    return [assets ? `${assets} piece${assets === 1 ? '' : 's'}` : '', lots ? `${lots} stock` : ''].filter(Boolean).join(' · ');
  }, [cart.entries]);

  const renderItem = useCallback(
    ({ item: e, index }: { item: CartEntry; index: number }) => {
      const g = groupStyle(e.item.category);
      const invalidQty = e.entityType === 'lot' && (!(e.quantity > 0) || e.quantity > e.item.quantity);
      return (
        <Glass radius={radius.md} style={[styles.rowCard, invalidQty && { borderColor: colors.error }]}>
          <View style={styles.line}>
            <Text style={styles.index}>{cart.entries.length - index}</Text>
            <IconBubble icon={g.icon} color={g.color} size={36} />
            <View style={styles.lineText}>
              <Text style={type.headline} numberOfLines={1}>{fullName(e.item)}</Text>
              <Text style={type.caption} numberOfLines={1}>
                <Text style={type.mono}>{e.item.code}</Text>
                {e.entityType === 'asset'
                  ? e.item.project_name || e.item.location_name ? `  ·  ${e.item.project_name ?? e.item.location_name}` : ''
                  : `  ·  ${fmtQty(e.item.quantity)} ${e.item.unit} on hand`}
              </Text>
            </View>
            <View style={styles.lineRight}>
              {e.entityType === 'lot' ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <QtyInput value={e.quantity ? String(e.quantity) : ''} placeholder="0" onChangeText={(t) => cart.setQuantity(e.item.id, Number(t.replace(',', '.')) || 0)} style={invalidQty ? { borderColor: colors.error } : undefined} />
                  <Text style={styles.unit}>{e.item.unit}</Text>
                </View>
              ) : (
                <StatusBadge status={e.item.status} />
              )}
              <PressScale onPress={() => cart.remove(e.item.id)} style={styles.remove}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </PressScale>
            </View>
          </View>
        </Glass>
      );
    },
    [cart],
  );

  const hasInvalidQty = cart.entries.some((e) => e.entityType === 'lot' && (!(e.quantity > 0) || e.quantity > e.item.quantity));
  const accent = mode === 'issue' ? colors.primary : colors.success;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: returnReview ? 'Return to inventory' : mode === 'issue' ? 'Issue equipment' : 'Return equipment' }} />
      <Backdrop />

      {/* camera starts below the navigation bar instead of underneath it */}
      {!returnReview ? (
        <View style={[styles.cameraWrap, { marginTop: headerSpace }]}>
          <Scanner onScan={onScan} hint={mode === 'issue' ? 'Scan items to issue' : 'Scan items to return'} compact />
        </View>
      ) : null}

      <View style={[styles.controls, returnReview && { paddingTop: headerSpace + space.md }]}>
        {returnReview ? (
          <View style={styles.reviewHeader}>
            <Text style={type.title}>Choose items to return</Text>
            <Text style={type.caption}>Remove any equipment that is staying with the project, then continue.</Text>
          </View>
        ) : (
          <>
            <Segmented options={[{ value: 'issue', label: 'Issue' }, { value: 'return', label: 'Return' }]} value={mode} onChange={switchMode} />
            <StatusLine status={status} onDone={clearStatus} />
          </>
        )}
        <View style={styles.listHeader}>
          <Text style={type.overline}>{cart.entries.length ? `${cart.entries.length} selected` : 'No items selected'}</Text>
          {summary ? <Text style={[type.caption, { color: accent }]}>{summary}</Text> : null}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={cart.entries}
        keyExtractor={(e) => e.item.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: BAR_SPACE + Math.max(insets.bottom, space.md) + space.md, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <Empty
            icon={returnReview ? 'checkmark-done-outline' : 'scan-outline'}
            text={returnReview ? 'No equipment selected to return.' : mode === 'issue' ? 'Scan the QR on each item you’re taking out.' : 'Scan the QR on each item coming back.'}
          />
        }
      />

      <BottomBar>
        <Button title="Clear" variant="secondary" icon="trash-outline" onPress={cart.clear} disabled={!cart.entries.length} style={{ flex: 0.42 }} />
        <Button
          title={returnReview ? (cart.entries.length ? `Return ${cart.entries.length} to inventory` : 'Return to inventory') : cart.entries.length ? `${mode === 'issue' ? 'Issue' : 'Return'} ${cart.entries.length}` : mode === 'issue' ? 'Issue' : 'Return'}
          icon={mode === 'issue' ? 'arrow-up' : 'arrow-down'}
          onPress={() => router.push(`/action?action=${mode}&cart=1${params.projectId ? `&projectId=${params.projectId}` : ''}`)}
          disabled={!cart.entries.length || hasInvalidQty}
          style={{ flex: 1 }}
        />
      </BottomBar>
    </View>
  );
}

/** Fixed-height scan feedback that fades out, so the list below never jumps. */
function StatusLine({ status, onDone }: { status: Status; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!status) return;
    opacity.setValue(1);
    const t = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(onDone), 2200);
    return () => clearTimeout(t);
  }, [status, opacity, onDone]);

  return (
    <View style={styles.statusSlot}>
      {status ? (
        <Animated.View style={[styles.status, { opacity, backgroundColor: status.ok ? 'rgba(46,230,166,0.12)' : 'rgba(255,61,154,0.12)' }]}>
          <Ionicons name={status.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={status.ok ? colors.success : colors.error} />
          <Text style={[styles.statusText, { color: status.ok ? colors.success : colors.error }]} numberOfLines={1}>{status.text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { height: '32%', marginHorizontal: space.lg, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  controls: { paddingHorizontal: space.lg, paddingTop: space.md },
  reviewHeader: { gap: space.xs, marginBottom: space.lg },
  statusSlot: { height: 38, justifyContent: 'center', marginBottom: space.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: radius.sm, paddingHorizontal: space.md },
  statusText: { fontWeight: '600', flex: 1, fontSize: 14 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm, paddingHorizontal: 2 },
  rowCard: { marginBottom: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingLeft: space.sm, paddingRight: space.sm, gap: space.sm },
  index: { width: 18, textAlign: 'center', color: colors.textFaint, fontSize: 12, fontWeight: '700' },
  lineText: { flex: 1, minWidth: 0 },
  lineRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  unit: { fontSize: 10, color: colors.textMuted, marginTop: 2, marginRight: 4 },
  remove: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
