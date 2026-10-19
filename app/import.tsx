import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Button, Card, Empty, IconBubble, Row, Screen, SectionTitle } from '../src/components/ui';
import { useToast } from '../src/components/Toast';
import { csvToImportRows, ParsedImport, TEMPLATE_CSV, TEMPLATE_HEADERS } from '../src/lib/csv';
import { categoryPath, fullName, getAsset, getLot, importItems, ImportResult, qrValueFor } from '../src/services/inventory';
import { printLabels, shareLabelsPdf } from '../src/lib/labels';
import { cmyk, colors, space, type } from '../src/theme';

/**
 * Bulk import for large catalogs: pick a CSV (exported from Excel, Google Sheets,
 * Tally…), preview it, then create every product, unit, QR code and location in
 * one transaction.
 */
export default function ImportScreen() {
  const toast = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    try {
      const text = await new File(asset.uri).text();
      const p = csvToImportRows(text);
      if (p.missingName) return Alert.alert('Missing "name" column', `The first row must be headers. Expected columns:\n${TEMPLATE_HEADERS.join(', ')}`);
      setFileName(asset.name);
      setParsed(p);
      setResult(null);
    } catch (e) {
      toast(`Could not read file: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const shareTemplate = async () => {
    const file = new File(Paths.cache, 'ink-inventory-template.csv');
    file.write(TEMPLATE_CSV);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Import template' });
  };

  const run = () => {
    if (!parsed) return;
    setBusy(true);
    // Let the spinner render before the synchronous SQLite work starts.
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const r = importItems(parsed.rows);
          setResult(r);
          toast(`Imported ${r.assets + r.lots} items${r.errors.length ? ` · ${r.errors.length} skipped` : ''}`, r.errors.length ? 'info' : 'success');
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
          setBusy(false);
        }
      }, 50);
    });
  };

  const labelsFor = (r: ImportResult) =>
    r.created.map(({ entityType, id }) => {
      const item = entityType === 'asset' ? getAsset(id)! : getLot(id)!;
      return { code: item.code, title: fullName(item), subtitle: categoryPath(item), qrValue: qrValueFor(item.code) };
    });

  const totals = parsed
    ? parsed.rows.reduce(
        (t, r) => {
          if (r.kind === 'asset') t.units += Math.max(1, r.count ?? 1);
          else t.lots += 1;
          return t;
        },
        { units: 0, lots: 0 },
      )
    : null;

  return (
    <Screen footer={parsed && !result ? <Button title={`Import ${parsed.rows.length.toLocaleString()} rows`} icon="checkmark-done" onPress={run} loading={busy} style={{ flex: 1 }} /> : undefined}>
      <Card>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconBubble icon="cloud-upload" color={cmyk.cyan} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={type.title}>Bulk import</Text>
            <Text style={type.caption}>Load your whole catalog from a CSV. Every unit gets its own QR code.</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button title="Get template" icon="document-text-outline" variant="secondary" compact onPress={shareTemplate} style={{ flex: 1 }} />
          <Button title={parsed ? 'Choose another' : 'Choose CSV'} icon="folder-open-outline" compact onPress={pick} style={{ flex: 1 }} />
        </View>
      </Card>

      {!parsed ? (
        <>
          <SectionTitle>Columns</SectionTitle>
          <Card padded={false}>
            <Row icon="text" title="name, subname" subtitle="Required name (Wire) and optional sub-name (1.5 mm red)" />
            <Row icon="shapes" iconColor={cmyk.magenta} title="type" subtitle="asset · consumable · quantity (default asset)" />
            <Row icon="pricetag" iconColor={cmyk.yellow} title="category, subcategory" subtitle="e.g. Cables, HDMI → codes CBL-HDM-0001. Custom names work too." />
            <Row icon="calculator" title="units / quantity, unit" subtitle="Units for assets; opening quantity and unit for stock" />
            <Row icon="location" iconColor={cmyk.magenta} title="location" subtitle="Matched by name, created if new" />
            <Row icon="barcode" iconColor={cmyk.yellow} title="barcode, supplier, batch" subtitle="Optional" last />
          </Card>
          <Text style={[type.caption, { textAlign: 'center', marginTop: space.md }]}>Common headers like “Item Name”, “Qty”, “UOM”, “SKU”, “Vendor” are recognised.</Text>
        </>
      ) : null}

      {parsed && !result ? (
        <>
          <SectionTitle>Preview · {fileName}</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Rows" value={parsed.rows.length} color={colors.text} />
              <Stat label="Asset units" value={totals!.units} color={cmyk.cyan} />
              <Stat label="Stock lots" value={totals!.lots} color={cmyk.magenta} />
            </View>
            {parsed.unknownColumns.length ? (
              <Text style={[type.caption, { color: cmyk.yellow, marginTop: space.md }]}>Ignored columns: {parsed.unknownColumns.join(', ')}</Text>
            ) : null}
          </Card>
          <Card padded={false}>
            {parsed.rows.slice(0, 8).map((r, i) => (
              <Row
                key={i}
                icon={r.kind === 'asset' ? 'cube' : 'layers'}
                iconColor={r.kind === 'asset' ? cmyk.cyan : cmyk.magenta}
                title={r.name ? fullName({ name: r.name, subname: r.subname }) : '(missing name)'}
                subtitle={`${[r.category, r.subcategory].filter(Boolean).join(' › ') || 'No category'} · ${r.kind === 'asset' ? `${r.count ?? 1} unit(s)` : `${r.quantity ?? 0} ${r.unit ?? ''}`}${r.location ? ` · ${r.location}` : ''}`}
                last={i === Math.min(7, parsed.rows.length - 1)}
              />
            ))}
            {parsed.rows.length > 8 ? <Text style={[type.caption, { textAlign: 'center', padding: space.md }]}>…and {parsed.rows.length - 8} more</Text> : null}
          </Card>
        </>
      ) : null}

      {result ? (
        <>
          <SectionTitle>Done</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Products" value={result.products} color={colors.text} />
              <Stat label="Units" value={result.assets} color={cmyk.cyan} />
              <Stat label="Lots" value={result.lots} color={cmyk.magenta} />
              <Stat label="Locations" value={result.locationsCreated} color={cmyk.yellow} />
            </View>
          </Card>
          {result.created.length ? (
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
              <Button title="Print labels" icon="print-outline" onPress={() => printLabels(labelsFor(result))} style={{ flex: 1 }} />
              <Button title="PDF" icon="share-outline" variant="secondary" onPress={() => shareLabelsPdf(labelsFor(result))} style={{ flex: 0.6 }} />
            </View>
          ) : null}
          <SectionTitle>Skipped rows · {result.errors.length}</SectionTitle>
          <Card padded={false}>
            {result.errors.length === 0 ? (
              <Empty icon="checkmark-circle-outline" text="Every row imported." />
            ) : (
              result.errors.slice(0, 50).map((e, i) => (
                <Row key={i} icon="warning" iconColor={colors.error} title={`Row ${e.row}`} subtitle={e.message} last={i === Math.min(49, result.errors.length - 1)} />
              ))
            )}
          </Card>
          <Button title="View inventory" variant="secondary" icon="cube-outline" onPress={() => router.replace('/inventory')} />
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.title, { color }]}>{value.toLocaleString()}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}
