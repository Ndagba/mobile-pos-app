import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import dayjs from 'dayjs';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  changes: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: { first_name: string; last_name: string };
}

export default function AuditLogsScreen() {
  const navigation = useNavigation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadLogs = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const res: any = await ApiClient.get('/audit', {
        params: { cursor, limit: 30 }
      });
      const items = res?.items ?? [];
      if (cursor) {
        setLogs(prev => [...prev, ...items]);
      } else {
        setLogs(items);
      }
      setNextCursor(res?.nextCursor || null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const renderLog = ({ item }: { item: AuditLog }) => {
    let actionColor: string = C.ink;
    let icon = 'shield-alert';
    
    if (item.action.includes('LOGIN') || item.action.includes('START') || item.action.includes('CREATE')) {
      actionColor = C.green;
      icon = 'plus-circle-outline';
    } else if (item.action.includes('VOID') || item.action.includes('DELETE')) {
      actionColor = C.rose;
      icon = 'minus-circle-outline';
    } else if (item.action.includes('DISCOUNT') || item.action.includes('UPDATE')) {
      actionColor = C.amber;
      icon = 'pencil-circle-outline';
    }

    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name={icon as any} size={20} color={actionColor} style={{ marginRight: 8 }} />
            <Text style={[styles.actionText, { color: actionColor }]}>{item.action}</Text>
          </View>
          <Text style={styles.timeText}>{dayjs(item.created_at).format('MMM D, HH:mm')}</Text>
        </View>
        <Text style={styles.userText}>User: {item.user?.first_name || 'System'} {item.user?.last_name || ''}</Text>
        {item.resource_type && (
          <Text style={styles.resourceText}>{item.resource_type} {item.resource_id ? `#${item.resource_id.substring(0, 8)}` : ''}</Text>
        )}
        {item.changes && Object.keys(item.changes).length > 0 && (
          <View style={styles.changesBox}>
            <Text style={styles.changesText}>{JSON.stringify(item.changes, null, 2)}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Audit Logs</Text>
      </View>

      <FlatList
        data={logs}
        keyExtractor={l => l.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={renderLog}
        ListEmptyComponent={
          !loading ? <Text style={{ textAlign: 'center', marginTop: 20 }}>No logs found.</Text> : null
        }
        onEndReached={() => {
          if (nextCursor && !loading) {
            loadLogs(nextCursor);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 20,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border
  },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  card: {
    backgroundColor: C.card, padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: C.border
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  actionText: { fontSize: 14, fontWeight: '700' },
  timeText: { fontSize: 12, color: C.muted },
  userText: { fontSize: 13, color: C.ink, marginBottom: 4 },
  resourceText: { fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 8 },
  changesBox: { backgroundColor: C.bg, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  changesText: { fontSize: 11, color: C.muted, fontFamily: 'monospace' }
});
