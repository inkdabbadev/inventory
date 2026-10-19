import { Alert, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, IconBubble, Row, Screen, SectionTitle } from '../../src/components/ui';
import { HistoryList } from '../../src/components/ItemParts';
import { useToast } from '../../src/components/Toast';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { fullName, getProject, InventoryError, projectAssets, projectHistory, setProjectStatus } from '../../src/services/inventory';
import { useCart } from '../../src/store/cart';
import { cmyk, colors, space, type } from '../../src/theme';

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, reloadProject] = useFocusQuery(() => getProject(id), [id]);
  const [out] = useFocusQuery(() => projectAssets(id), [id]);
  const [moves] = useFocusQuery(() => projectHistory(id), [id]);
  const cart = useCart();
  const toast = useToast();
  if (!project) return <Screen><Empty text="Project not found." /></Screen>;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = out.filter((a) => a.expected_return && a.expected_return < today).length;

  const returnAll = () => {
    cart.clear();
    out.forEach((a) => cart.add({ entityType: 'asset', item: a }));
    router.push('/action?action=return&cart=1');
  };

  const toggle = () => {
    const closing = project.status === 'active';
    const run = () => {
      try {
        setProjectStatus(project.id, closing ? 'closed' : 'active');
        toast(closing ? 'Project closed' : 'Project reopened');
        reloadProject();
      } catch (e) {
        toast(e instanceof InventoryError ? e.message : String(e), 'error');
      }
    };
    if (closing) Alert.alert('Close project?', 'Closed projects are hidden from pickers.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Close', style: 'destructive', onPress: run }]);
    else run();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: project.code }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconBubble icon={project.status === 'closed' ? 'archive' : 'briefcase'} color={project.status === 'closed' ? colors.textMuted : cmyk.cyan} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={type.title}>{project.name}</Text>
            <Text style={type.caption}>{project.code} · {project.status}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: space.lg }}>
          <Metric label="Out now" value={out.length} color={out.length ? cmyk.yellow : colors.text} />
          <Metric label="Overdue" value={overdue} color={overdue ? colors.error : colors.text} />
          <Metric label="Movements" value={moves.length} color={colors.text} />
        </View>
      </Card>

      {out.length > 0 ? <Button title={`Return all ${out.length}`} icon="arrow-down" onPress={returnAll} style={{ marginBottom: space.sm }} /> : null}

      <SectionTitle>Equipment out · {out.length}</SectionTitle>
      <Card padded={false}>
        {out.length === 0 ? <Empty icon="checkmark-done-outline" text="Nothing checked out." /> : out.map((a, i) => (
          <Row
            key={a.id}
            icon="cube"
            iconColor={a.expected_return && a.expected_return < today ? colors.error : cmyk.yellow}
            title={fullName(a)}
            subtitle={`${a.code}${a.expected_return ? ` · due ${a.expected_return}` : ''}`}
            onPress={() => router.push(`/asset/${a.id}`)}
            last={i === out.length - 1}
          />
        ))}
      </Card>
      <Button title={project.status === 'active' ? 'Close project' : 'Reopen project'} variant={project.status === 'active' ? 'danger' : 'secondary'} icon={project.status === 'active' ? 'archive-outline' : 'refresh'} onPress={toggle} style={{ marginVertical: space.sm }} />
      <HistoryList items={moves} />
    </Screen>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.title, { color }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}
