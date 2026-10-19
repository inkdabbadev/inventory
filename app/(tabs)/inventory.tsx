import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Backdrop, Chips, Empty, Field, Glass, IconButton, LargeHeader, Row, StatusBadge } from '../../src/components/ui';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { useDebounced } from '../../src/hooks/useDebounced';
import { fmtQty, fullName, listCategories, searchInventory } from '../../src/services/inventory';
import { groupStyle } from '../../src/domain/taxonomy';
import type { AssetView, LotView } from '../../src/domain/types';
import { colors, space, TAB_BAR_SPACE } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Filter = 'all' | 'available' | 'checked_out' | 'maintenance' | 'stock';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'stock', label: 'Stock' },
];

const PAGE = 60;

type Item ={ kind: 'asset'; a: AssetView } | { kind: 'lot'; l: LotView } | { kind: 'header'; title: string };

/** Virtualised list - stays smooth with thousands of assets. */
export default function InventoryList() {
  const params = useLocalSearchParams<{ filter?: Filter; focus?: string; category?: string; sub?: string }>();
  const categories = useMemo(listCategories, []);
  const [category, setCategory] = useState<string | null>(params.category ?? null);
  const [sub, setSub] = useState<string | null>(params.sub ?? null);
  // Opening from the Categories screen while this tab is already mounted.
  useEffect(() => {
    if (params.category !== undefined) {
      setCategory(params.category || null);
      setSub(params.sub || null);
    }
  }, [params.category, params.sub]);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<Filter>(params.filter ?? 'all');
  const q = useDebounced(term);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q, filter, category, sub]); // new search starts from the first page
  const [{ assets, lots, assetTotal, lotTotal }, reload] = useFocusQuery(() => searchInventory(q, filter, limit, category, sub), [q, filter, limit, category, sub]);
  const today = new Date().toISOString().slice(0, 10);
  const hasMore = assets.length < assetTotal || lots.length < lotTotal;

  const data = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (assets.length) out.push({ kind: 'header', title: `Assets · ${assetTotal.toLocaleString()}` }, ...assets.map((a) => ({ kind: 'asset' as const, a })));
    if (lots.length) out.push({ kind: 'header', title: `Stock · ${lotTotal.toLocaleString()}` }, ...lots.map((l) => ({ kind: 'lot' as const, l })));
    return out;
  }, [assets, lots, assetTotal, lotTotal]);

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.kind === 'header') return <Text style={styles.section}>{item.title}</Text>;
      if (item.kind === 'asset') {
        const a = item.a;
        const overdue = a.expected_return && a.expected_return < today;
        return (
          <Glass radius={16} style={styles.item}>
            <Row
              icon={groupStyle(a.category).icon}
              iconColor={a.status === 'available' ? groupStyle(a.category).color : a.status === 'checked_out' ? colors.warning : colors.error}
              title={fullName(a)}
              subtitle={`${a.code} · ${a.status === 'checked_out' ? `${a.project_name ?? 'Out'}${a.expected_return ? ` · due ${a.expected_return}${overdue ? ' ⚠︎' : ''}` : ''}` : a.location_name ?? 'No location'}`}
              right={<StatusBadge status={a.status} />}
              onPress={() => router.push(`/asset/${a.id}`)}
              last
            />
          </Glass>
        );
      }
      const l = item.l;
      return (
        <Glass radius={16} style={styles.item}>
          <Row
            icon={groupStyle(l.category).icon}
            iconColor={groupStyle(l.category).color}
            title={fullName(l)}
            subtitle={`${l.code} · ${l.location_name ?? 'No location'}`}
            right={
              <Text style={[styles.qty, { color: l.quantity > 0 ? colors.text : colors.error }]}>
                {fmtQty(l.quantity)} <Text style={styles.unit}>{l.unit}</Text>
              </Text>
            }
            onPress={() => router.push(`/lot/${l.id}`)}
            last
          />
        </Glass>
      );
    },
    [today],
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <FlatList
        data={data}
        keyExtractor={(i) => (i.kind === 'header' ? i.title : i.kind === 'asset' ? i.a.id : i.l.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.sm, paddingBottom: TAB_BAR_SPACE }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        windowSize={9}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.6}
        onEndReached={() => hasMore && setLimit((l) => l + PAGE)}
        ListFooterComponent={hasMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: space.lg }} /> : undefined}
        ListHeaderComponent={
          <>
            <LargeHeader
              title="Inventory"
              subtitle={`${(assetTotal + lotTotal).toLocaleString()} records`}
              right={
                <>
                  <IconButton icon="cloud-upload-outline" onPress={() => router.push('/import')} />
                  <IconButton icon="add" color={colors.primary} onPress={() => router.push('/add')} />
                </>
              }
            />
            <Field label="" icon="search" value={term} onChangeText={setTerm} placeholder="Search name, sub-name, code" autoCorrect={false} clearButtonMode="while-editing" autoFocus={params.focus === '1'} returnKeyType="search" />
            <Chips options={FILTERS} value={filter} onChange={setFilter} scroll />
            {categories.length ? (
              <Chips
                options={[{ value: '__all', label: 'All categories', icon: 'pricetags-outline' as const }, ...categories.map((c) => ({ value: c, label: c }))]}
                value={category ?? '__all'}
                onChange={(v) => {
                  setCategory(v === '__all' ? null : v);
                  setSub(null);
                }}
                scroll
              />
            ) : null}
            {sub ? (
              <Chips options={[{ value: sub, label: `${sub}  ✕`, icon: 'funnel' as const }]} value={sub} onChange={() => setSub(null)} />
            ) : null}
          </>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); setRefreshing(false); }} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.backgroundRaised} />}
        ListEmptyComponent={
          term || category || sub || filter !== 'all' ? (
            <Empty icon="search-outline" text={term ? `Nothing matches “${term}”.` : 'Nothing in this filter.'} action={{ label: 'Clear filters', icon: 'close', onPress: () => { setTerm(''); setCategory(null); setSub(null); setFilter('all'); } }} />
          ) : (
            <Empty icon="cube-outline" text="Your inventory is empty. Add an item or import a list." action={{ label: 'Add item', onPress: () => router.push('/add') }} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.textMuted, marginTop: space.md, marginBottom: space.sm, marginLeft: 2 },
  item: { marginBottom: space.sm },
  qty: { fontWeight: '800', fontSize: 16 },
  unit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
});
