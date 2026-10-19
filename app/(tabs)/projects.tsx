import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Empty, Field, LargeHeader, Row, Screen, SectionTitle, Segmented } from '../../src/components/ui';
import { useToast } from '../../src/components/Toast';
import { useFocusQuery } from '../../src/hooks/useRefresh';
import { createProject, InventoryError, listProjects } from '../../src/services/inventory';
import { colors } from '../../src/theme';

export default function Projects() {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [projects, reload] = useFocusQuery(() => listProjects(scope === 'all'), [scope]);
  const [name, setName] = useState('');
  const toast = useToast();
  const totalOut = projects.reduce((n, p) => n + p.out_count, 0);

  const add = () => {
    try {
      createProject(name);
      toast(`Project “${name.trim()}” created`);
      setName('');
      reload();
    } catch (e) {
      Alert.alert('Error', e instanceof InventoryError ? e.message : String(e));
    }
  };

  return (
    <Screen tabs header={false}>
      <LargeHeader title="Projects" subtitle={`${totalOut} items out in the field`} />
      <Card>
        <Field label="New project / event" icon="briefcase-outline" value={name} onChangeText={setName} placeholder="Wedding shoot – Chennai" onSubmitEditing={add} returnKeyType="done" />
        <Button title="Create project" icon="add" onPress={add} disabled={!name.trim()} />
      </Card>
      <Segmented options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All projects' }]} value={scope} onChange={setScope} />
      <SectionTitle>{projects.length} projects</SectionTitle>
      <Card padded={false}>
        {projects.length === 0 ? (
          <Empty icon="briefcase-outline" text="No projects yet." />
        ) : (
          projects.map((p, i) => (
            <Row
              key={p.id}
              icon={p.status === 'closed' ? 'archive' : 'briefcase'}
              iconColor={p.status === 'closed' ? colors.textMuted : p.out_count ? colors.warning : colors.primary}
              title={p.name}
              subtitle={`${p.code}${p.status === 'closed' ? ' · closed' : ''}`}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '800', fontSize: 17, color: p.out_count ? colors.warning : colors.textFaint }}>{p.out_count}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>out</Text>
                </View>
              }
              onPress={() => router.push(`/projects/${p.id}`)}
              last={i === projects.length - 1}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
