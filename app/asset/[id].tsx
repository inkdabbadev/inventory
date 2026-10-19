import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, IconBubble, Screen, StatusBadge, type IconName } from '../../src/components/ui';
import { ActionTile, HistoryList, IdentityCard, InfoLine } from '../../src/components/ItemParts';
import { useToast } from '../../src/components/Toast';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { categoryPath, fullName, getAsset, history } from '../../src/services/inventory';
import { useCart } from '../../src/store/cart';
import { groupStyle } from '../../src/domain/taxonomy';
import { cmyk, colors, space, type } from '../../src/theme';
import { ProductImage } from '../../src/components/ProductImage';

export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [asset] = useFocusQuery(() => getAsset(id), [id]);
  const [moves] = useFocusQuery(() => history('asset', id), [id]);
  const cart = useCart();
  const toast = useToast();

  if (!asset) return <Screen><Empty text="Asset not found." /></Screen>;
  const act = (action: string) => router.push(`/action?action=${action}&entityType=asset&id=${asset.id}`);
  const overdue = !!asset.expected_return && asset.expected_return < new Date().toISOString().slice(0, 10);

  const primary: { icon: IconName; label: string; color: string; action: string } =
    asset.status === 'checked_out'
      ? { icon: 'arrow-down', label: 'Return', color: colors.success, action: 'return' }
      : asset.status === 'maintenance'
        ? { icon: 'checkmark-done', label: 'Restore', color: colors.success, action: 'restore' }
        : { icon: 'arrow-up', label: 'Issue', color: cmyk.cyan, action: 'issue' };

  return (
    <Screen>
      <Stack.Screen options={{ title: asset.code }} />
      <Card>
        {asset.image_key ? (
          <ProductImage imageKey={asset.image_key} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 14, marginBottom: space.md, backgroundColor: colors.surfaceStrong }} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <IconBubble icon={groupStyle(asset.category).icon} color={groupStyle(asset.category).color} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={type.title}>{asset.name}</Text>
            {asset.subname ? <Text style={[type.body, { color: colors.textMuted }]}>{asset.subname}</Text> : null}
            <Text style={[type.caption, type.mono, { marginTop: 2 }]}>{asset.code}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: space.md, marginBottom: space.sm }}>
          <StatusBadge status={asset.status} />
          {overdue ? <View style={{ marginLeft: 8 }}><StatusBadge status="maintenance" /></View> : null}
        </View>
        <InfoLine icon="location-outline" label="Location" value={asset.location_name} />
        <InfoLine icon="pricetag-outline" label="Category" value={categoryPath(asset)} />
        <InfoLine icon="pulse-outline" label="Condition" value={asset.condition} />
        <InfoLine icon="briefcase-outline" label="Project" value={asset.project_name} />
        <InfoLine icon="person-outline" label="Issued by" value={asset.holder} />
        <InfoLine icon="calendar-outline" label="Due back" value={asset.expected_return ? `${asset.expected_return}${overdue ? ' · overdue' : ''}` : null} />
      </Card>
      <Button title={asset.image_key ? 'Change product image' : 'Add product image'} icon="camera-outline" variant="secondary" onPress={() => router.push(`/product-photo?productId=${asset.product_id}`)} style={{ marginBottom: space.sm }} />

      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
        <ActionTile icon={primary.icon} label={primary.label} color={primary.color} onPress={() => act(primary.action)} />
        <ActionTile icon="swap-horizontal" label="Transfer" color={cmyk.magenta} onPress={() => act('transfer')} />
        <ActionTile
          icon="cart"
          label="Cart"
          color={cmyk.yellow}
          onPress={() => {
            const r = cart.add({ entityType: 'asset', item: asset });
            toast(r === 'added' ? `${asset.code} added to cart` : `${asset.code} is already in the cart`, r === 'added' ? 'success' : 'info');
          }}
        />
        <ActionTile icon="construct" label="Repair" color={colors.error} onPress={() => act('maintenance')} disabled={asset.status !== 'available'} />
      </View>

      <IdentityCard entityType="asset" id={asset.id} code={asset.code} title={fullName(asset)} subtitle={categoryPath(asset)} />
      <HistoryList items={moves} />
    </Screen>
  );
}
