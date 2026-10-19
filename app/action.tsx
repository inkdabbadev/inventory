import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chips, Field, IconBubble, IconButton, IconName, Label, Screen } from '../src/components/ui';
import { groupStyle } from '../src/domain/taxonomy';
import { LocationPicker, ProjectPicker } from '../src/components/pickers';
import { useToast } from '../src/components/Toast';
import { applyAction, CartLine, fmtQty, fullName, getAsset, getLot, InventoryError } from '../src/services/inventory';
import { useCart } from '../src/store/cart';
import type { MovementType } from '../src/domain/types';
import { cmyk, colors, space, type } from '../src/theme';

const META: Record<string, { title: string; icon: IconName; color: string; done: string }> = {
  issue: { title: 'Issue', icon: 'arrow-up', color: cmyk.cyan, done: 'Issued' },
  return: { title: 'Return', icon: 'arrow-down', color: colors.success, done: 'Returned' },
  transfer: { title: 'Transfer', icon: 'swap-horizontal', color: cmyk.magenta, done: 'Moved' },
  maintenance: { title: 'Send to maintenance', icon: 'construct', color: colors.error, done: 'Sent to maintenance' },
  restore: { title: 'Back in service', icon: 'checkmark-done', color: colors.success, done: 'Back in service' },
  consume: { title: 'Use stock', icon: 'remove', color: cmyk.cyan, done: 'Stock updated' },
  receive: { title: 'Restock', icon: 'add', color: colors.success, done: 'Stock added' },
  adjust: { title: 'Count & adjust', icon: 'calculator', color: cmyk.yellow, done: 'Count saved' },
};

const CONDITIONS = [
  { value: 'good', label: 'Good', icon: 'happy-outline' as IconName },
  { value: 'worn', label: 'Worn', icon: 'remove-circle-outline' as IconName },
  { value: 'damaged', label: 'Damaged', icon: 'warning-outline' as IconName },
];

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * One form for every movement. With `cart=1` it applies to every line in the
 * multi-scan cart as a single all-or-nothing transaction.
 */
export default function ActionScreen() {
  const p = useLocalSearchParams<{ action: MovementType; entityType?: 'asset' | 'lot'; id?: string; cart?: string }>();
  const action = p.action;
  const meta = META[action] ?? META.issue;
  const cart = useCart();
  const toast = useToast();
  const fromCart = p.cart === '1';
  const insets = useSafeAreaInsets();

  const target = useMemo(() => {
    if (fromCart || !p.id) return null;
    return p.entityType === 'asset' ? getAsset(p.id) : getLot(p.id);
  }, [fromCart, p.entityType, p.id]);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [expectedReturn, setExpectedReturn] = useState('');
  const [quantity, setQuantity] = useState('');
  const [condition, setCondition] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const isLot = p.entityType === 'lot';
  const needsQty = !fromCart && isLot && ['consume', 'receive', 'adjust'].includes(action);
  const showProject = action === 'issue' || action === 'consume';
  const showLocation = action === 'transfer' || action === 'return';
  const unit = target && 'unit' in target ? target.unit : '';
  const available = target && 'quantity' in target ? target.quantity : null;
  const qtyNum = Number(quantity.replace(',', '.'));
  const remaining = available != null && qtyNum > 0 ? (action === 'consume' ? available - qtyNum : action === 'receive' ? available + qtyNum : qtyNum) : null;

  const submit = () => {
    try {
      const lines: CartLine[] = fromCart
        ? cart.entries.map((e) => (e.entityType === 'asset' ? { entityType: 'asset', entityId: e.item.id } : { entityType: 'lot', entityId: e.item.id, quantity: e.quantity }))
        : [{ entityType: p.entityType!, entityId: p.id! }];
      if (expectedReturn && !/^\d{4}-\d{2}-\d{2}$/.test(expectedReturn)) throw new InventoryError('Expected return must be YYYY-MM-DD.');
      applyAction(action, lines, {
        projectId,
        locationId,
        expectedReturn: expectedReturn || null,
        quantity: needsQty ? qtyNum : undefined,
        condition: condition ?? undefined,
        notes: notes.trim() || null,
      });
      toast(fromCart ? `${meta.done} · ${lines.length} item(s)` : `${meta.done} · ${target?.code ?? ''}`);
      if (fromCart) cart.clear();
      router.back();
    } catch (e) {
      toast(e instanceof InventoryError ? e.message : String(e), 'error');
    }
  };

  const needsProject = action === 'issue' && (fromCart ? cart.entries.some((e) => e.entityType === 'asset') : !isLot);
  const blocked = (needsProject && !projectId) || (needsQty && !(qtyNum > 0) && action !== 'adjust') || (fromCart && cart.entries.length === 0);
  const sheetTop = Platform.OS === 'ios' ? space.md : insets.top + space.sm; // iOS sheet has no status bar

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen
        header={false}
        top={sheetTop}
        footer={
          <Button
            title={fromCart ? `${meta.title} ${cart.entries.length} item${cart.entries.length === 1 ? '' : 's'}` : `Confirm ${meta.title.toLowerCase()}`}
            icon={meta.icon}
            onPress={submit}
            disabled={blocked}
            variant={action === 'maintenance' ? 'warm' : 'primary'}
            style={{ flex: 1 }}
          />
        }
      >
        {Platform.OS === 'ios' ? <View style={styles.grabber} /> : null}

        {/* sheet header: icon, title, close */}
        <View style={styles.header}>
          <IconBubble icon={meta.icon} color={meta.color} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.title} numberOfLines={1}>{meta.title}</Text>
            <Text style={type.caption} numberOfLines={1}>
              {fromCart ? `${cart.entries.length} item${cart.entries.length === 1 ? '' : 's'} in one transaction` : target ? `${target.code} · ${fullName(target)}` : ''}
            </Text>
          </View>
          <IconButton icon="close" onPress={() => router.back()} />
        </View>

        {/* what is being moved */}
        {fromCart ? (
          <Card padded={false}>
            {cart.entries.slice(0, 6).map((e, i) => {
              const g = groupStyle(e.item.category);
              return (
                <View key={e.item.id} style={[styles.itemRow, i > 0 && styles.itemDivider]}>
                  <Ionicons name={g.icon} size={16} color={g.color} />
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{fullName(e.item)}</Text>
                  <Text style={[type.caption, type.mono]}>{e.entityType === 'lot' ? `${fmtQty(e.quantity)} ${e.item.unit}` : e.item.code}</Text>
                </View>
              );
            })}
            {cart.entries.length > 6 ? <Text style={[type.caption, styles.more]}>+ {cart.entries.length - 6} more</Text> : null}
          </Card>
        ) : null}

        {available != null ? (
          <Card>
            <View style={styles.balance}>
              <View>
                <Text style={type.overline}>On hand</Text>
                <Text style={[type.title, { marginTop: 2 }]}>{fmtQty(available)} <Text style={type.caption}>{unit}</Text></Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textFaint} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={type.overline}>{action === 'adjust' ? 'New count' : 'After'}</Text>
                <Text style={[type.title, { marginTop: 2, color: remaining == null ? colors.textFaint : remaining < 0 ? colors.error : meta.color }]}>
                  {remaining == null ? '—' : fmtQty(remaining)} <Text style={type.caption}>{unit}</Text>
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card>
          {needsQty ? (
            <Field
              label={action === 'adjust' ? `Counted quantity (${unit})` : action === 'receive' ? `Quantity received (${unit})` : `Quantity used (${unit})`}
              icon="keypad-outline"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              autoFocus
            />
          ) : null}

          {showProject ? (
            <>
              <ProjectPicker value={projectId} onChange={setProjectId} />
              {needsProject && !projectId ? <Text style={styles.required}>Choose the project or event this is going to</Text> : null}
            </>
          ) : null}

          {action === 'issue' && (fromCart || !isLot) ? (
            <>
              <Label>Expected return</Label>
              <Chips
                options={[
                  { value: plusDays(0), label: 'Today' },
                  { value: plusDays(1), label: 'Tomorrow' },
                  { value: plusDays(3), label: '3 days' },
                  { value: plusDays(7), label: '1 week' },
                  { value: '', label: 'No date' },
                ]}
                value={expectedReturn}
                onChange={setExpectedReturn}
                scroll
              />
              <Field label="" icon="calendar-outline" value={expectedReturn} onChangeText={setExpectedReturn} placeholder="YYYY-MM-DD" hint={expectedReturn ? friendlyDate(expectedReturn) : undefined} />
            </>
          ) : null}

          {showLocation ? <LocationPicker value={locationId} onChange={setLocationId} label={action === 'return' ? 'Put back at (optional)' : 'Move to'} /> : null}

          {action === 'return' || action === 'restore' ? (
            <>
              <Label>Condition</Label>
              <Chips options={CONDITIONS} value={condition} onChange={setCondition} />
            </>
          ) : null}

          <Field label="Notes" icon="create-outline" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** "2026-10-18" -> "Sat, 18 Oct · in 2 days" */
function friendlyDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Use the format YYYY-MM-DD';
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  const rel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : `${-days} days ago`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${rel}`;
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 11 },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  more: { paddingHorizontal: space.lg, paddingBottom: space.md, paddingTop: 2 },
  balance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  required: { color: colors.warning, fontSize: 12, fontWeight: '600', marginTop: -4, marginBottom: space.md },
});
