import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop, BottomBar, Button, CONTROL_HEIGHT, Empty, Field, Glass, IconBubble, PressScale, QtyInput, useHeaderSpace } from '../src/components/ui';
import { groupStyle } from '../src/domain/taxonomy';
import type { AssetView, LotView } from '../src/domain/types';
import { useDebounced } from '../src/hooks/useDebounced';
import { useFocusQuery } from '../src/hooks/useRefresh';
import { fmtQty, fullName, getProject, projectAssignableInventory } from '../src/services/inventory';
import { useCart } from '../src/store/cart';
import { colors, radius, space, type } from '../src/theme';

const PAGE = 60;
const BAR_SPACE = CONTROL_HEIGHT + space.md * 2;
type ListItem = { kind: 'header'; title: string } | { kind: 'asset'; item: AssetView } | { kind: 'lot'; item: LotView };

export default function ProjectAddScreen() {
  const { projectId = '' } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const headerSpace = useHeaderSpace();
  const cart = useCart();
  const clearCart = cart.clear;
  const [term, setTerm] = useState('');
  const q = useDebounced(term);
  const [limit, setLimit] = useState(PAGE);
  const [project] = useFocusQuery(() => getProject(projectId), [projectId]);
  const [{ assets, lots, assetTotal, lotTotal }] = useFocusQuery(() => projectAssignableInventory(q, limit), [q, limit]);

  useEffect(() => clearCart(), [clearCart]);
  useEffect(() => setLimit(PAGE), [q]);

  const selected = useMemo(() => new Set(cart.entries.map((entry) => entry.item.id)), [cart.entries]);
  const invalidQuantity = cart.entries.some(
    (entry) => entry.entityType === 'lot' && (!(entry.quantity > 0) || entry.quantity > entry.item.quantity),
  );
  const hasMore = assets.length < assetTotal || lots.length < lotTotal;
  const data = useMemo<ListItem[]>(() => {
    const rows: ListItem[] = [];
    if (assets.length) rows.push({ kind: 'header', title: `Available assets · ${assetTotal}` }, ...assets.map((item) => ({ kind: 'asset' as const, item })));
    if (lots.length) rows.push({ kind: 'header', title: `Stock · ${lotTotal}` }, ...lots.map((item) => ({ kind: 'lot' as const, item })));
    return rows;
  }, [assets, lots, assetTotal, lotTotal]);

  const toggle = useCallback((kind: 'asset' | 'lot', item: AssetView | LotView) => {
    if (cart.entries.some((entry) => entry.item.id === item.id)) {
      cart.remove(item.id);
    } else if (kind === 'asset') {
      cart.add({ entityType: 'asset', item: item as AssetView });
    } else {
      cart.add({ entityType: 'lot', item: item as LotView, quantity: 1 });
    }
  }, [cart]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.kind === 'header') return <Text style={styles.section}>{item.title}</Text>;
    const record = item.item;
    const isSelected = selected.has(record.id);
    const group = groupStyle(record.category);
    const entry = cart.entries.find((candidate) => candidate.item.id === record.id);
    const invalid = entry?.entityType === 'lot' && (!(entry.quantity > 0) || entry.quantity > entry.item.quantity);
    return (
      <Glass radius={radius.md} style={[styles.card, isSelected && styles.selected, invalid && { borderColor: colors.error }]}>
        <PressScale onPress={() => toggle(item.kind, record)} style={styles.row}>
          <IconBubble icon={group.icon} color={group.color} size={40} />
          <View style={styles.details}>
            <Text style={type.headline} numberOfLines={1}>{fullName(record)}</Text>
            <Text style={type.caption} numberOfLines={1}>
              <Text style={type.mono}>{record.code}</Text> · {record.location_name ?? 'No location'}
            </Text>
            {item.kind === 'lot' ? <Text style={styles.available}>{fmtQty(item.item.quantity)} {item.item.unit} available</Text> : null}
          </View>
          {entry?.entityType === 'lot' ? (
            <View style={styles.quantity}>
              <QtyInput
                value={entry.quantity ? String(entry.quantity) : ''}
                placeholder="0"
                onChangeText={(value) => cart.setQuantity(record.id, Number(value.replace(',', '.')) || 0)}
                style={invalid ? { borderColor: colors.error } : undefined}
              />
              <Text style={styles.unit}>{entry.item.unit}</Text>
            </View>
          ) : (
            <Ionicons name={isSelected ? 'checkmark-circle' : 'add-circle-outline'} size={27} color={isSelected ? colors.success : colors.textMuted} />
          )}
        </PressScale>
      </Glass>
    );
  }, [cart, selected, toggle]);

  if (!project) return <View style={styles.screen}><Backdrop /><Empty text="Project not found." /></View>;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: project.name }} />
      <Backdrop />
      <View style={[styles.header, { paddingTop: headerSpace + space.sm }]}>
        <Text style={type.title}>Choose inventory</Text>
        <Text style={type.caption}>Select equipment or enter the stock quantity for {project.name}.</Text>
        <Field label="" icon="search" value={term} onChangeText={setTerm} placeholder="Search name, category or code" autoCorrect={false} clearButtonMode="while-editing" />
        <Button title="Scan items instead" icon="scan-outline" variant="secondary" onPress={() => router.push(`/cart?mode=issue&projectId=${projectId}`)} />
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.kind === 'header' ? item.title : item.item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: BAR_SPACE + insets.bottom + space.xl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReachedThreshold={0.6}
        onEndReached={() => hasMore && setLimit((current) => current + PAGE)}
        ListEmptyComponent={<Empty icon="search-outline" text={term ? `Nothing available matches “${term}”.` : 'No inventory is currently available.'} />}
        ListFooterComponent={hasMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: space.lg }} /> : undefined}
      />
      <BottomBar>
        <Button title="Clear" variant="secondary" icon="trash-outline" onPress={cart.clear} disabled={!cart.entries.length} style={{ flex: 0.42 }} />
        <Button
          title={cart.entries.length ? `Issue ${cart.entries.length} to project` : 'Select inventory'}
          icon="arrow-up"
          onPress={() => router.push(`/action?action=issue&cart=1&projectId=${projectId}`)}
          disabled={!cart.entries.length || invalidQuantity}
          style={{ flex: 1 }}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  section: { ...type.overline, marginTop: space.md, marginBottom: space.sm, marginLeft: 2 },
  card: { marginBottom: space.sm },
  selected: { borderColor: colors.success, backgroundColor: 'rgba(46,230,166,0.08)' },
  row: { minHeight: 72, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md },
  details: { flex: 1, minWidth: 0 },
  available: { ...type.caption, color: colors.primary, marginTop: 2 },
  quantity: { alignItems: 'flex-end' },
  unit: { ...type.caption, fontSize: 10, marginTop: 2, marginRight: 4 },
});
