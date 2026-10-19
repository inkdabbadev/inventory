import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, IconBubble, Screen, StatusBadge } from '../../src/components/ui';
import { ActionTile, HistoryList, IdentityCard, InfoLine } from '../../src/components/ItemParts';
import { useToast } from '../../src/components/Toast';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { categoryPath, fmtQty, fullName, getLot, history } from '../../src/services/inventory';
import { useCart } from '../../src/store/cart';
import { groupStyle } from '../../src/domain/taxonomy';
import { cmyk, colors, space, type } from '../../src/theme';
import { ProductImage } from '../../src/components/ProductImage';

export default function LotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lot] = useFocusQuery(() => getLot(id), [id]);
  const [moves] = useFocusQuery(() => history('lot', id), [id]);
  const cart = useCart();
  const toast = useToast();

  if (!lot) return <Screen><Empty text="Stock not found." /></Screen>;
  const act = (action: string) => router.push(`/action?action=${action}&entityType=lot&id=${lot.id}`);

  // Fill gauge relative to the largest balance this lot has had (receipts minus nothing).
  const peak = Math.max(lot.quantity, ...moves.filter((m) => m.type === 'receive').map((m) => m.quantity ?? 0), 1);
  const pct = Math.min(1, lot.quantity / peak);
  const low = pct < 0.2;

  return (
    <Screen>
      <Stack.Screen options={{ title: lot.code }} />
      <Card>
        {lot.image_key ? (
          <ProductImage imageKey={lot.image_key} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 14, marginBottom: space.md, backgroundColor: colors.surfaceStrong }} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <IconBubble icon={groupStyle(lot.category).icon} color={groupStyle(lot.category).color} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={type.title}>{lot.name}</Text>
            {lot.subname ? <Text style={[type.body, { color: colors.textMuted }]}>{lot.subname}</Text> : null}
            <Text style={[type.caption, type.mono, { marginTop: 2 }]}>{lot.code} · {lot.kind === 'consumable' ? 'Consumable' : 'Quantity'}</Text>
          </View>
          <StatusBadge status="stock" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: space.lg }}>
          <Text style={{ fontSize: 48, fontWeight: '800', letterSpacing: -1.5, color: lot.quantity > 0 ? colors.text : colors.error }}>{fmtQty(lot.quantity)}</Text>
          <Text style={[type.headline, { color: colors.textMuted, marginLeft: 8 }]}>{lot.unit} left</Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceStrong, overflow: 'hidden', marginTop: space.sm, marginBottom: space.md }}>
          <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: low ? cmyk.magenta : cmyk.cyan, borderRadius: 4 }} />
        </View>
        {low && lot.quantity > 0 ? <Text style={[type.caption, { color: cmyk.magenta, marginBottom: space.sm }]}>Running low — consider restocking</Text> : null}
        <InfoLine icon="location-outline" label="Location" value={lot.location_name} />
        <InfoLine icon="pricetag-outline" label="Category" value={categoryPath(lot)} />
        <InfoLine icon="storefront-outline" label="Supplier" value={lot.supplier} />
        <InfoLine icon="file-tray-stacked-outline" label="Batch" value={lot.batch} />
        <InfoLine icon="calendar-outline" label="Purchased" value={lot.purchase_date} />
      </Card>
      <Button title={lot.image_key ? 'Change product image' : 'Add product image'} icon="camera-outline" variant="secondary" onPress={() => router.push(`/product-photo?productId=${lot.product_id}`)} style={{ marginBottom: space.sm }} />

      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
        <ActionTile icon="remove" label={lot.kind === 'consumable' ? 'Use' : 'Take'} color={cmyk.cyan} onPress={() => act('consume')} disabled={lot.quantity <= 0} />
        <ActionTile icon="add" label="Restock" color={colors.success} onPress={() => act('receive')} />
        <ActionTile icon="calculator" label="Count" color={cmyk.yellow} onPress={() => act('adjust')} />
        <ActionTile icon="swap-horizontal" label="Move" color={cmyk.magenta} onPress={() => act('transfer')} />
      </View>
      <Card
        onPress={() => {
          const r = cart.add({ entityType: 'lot', item: lot, quantity: 1 });
          toast(r === 'added' ? `${lot.code} added — set quantity in cart` : `${lot.code} is already in the cart`, r === 'added' ? 'success' : 'info');
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'center' }}>Add to multi-scan cart</Text>
      </Card>

      <IdentityCard entityType="lot" id={lot.id} code={lot.code} title={fullName(lot)} subtitle={categoryPath(lot)} />
      <HistoryList items={moves} />
    </Screen>
  );
}
