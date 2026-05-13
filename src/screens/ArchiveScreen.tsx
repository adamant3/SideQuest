import { CheckCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/src/lib/supabase/client';

type CompletedQuest = {
  quest_id: string;
  completed_at: string;
  quest_title: string;
  rarity: string;
  xp_reward: number;
};

type CompletedQuestRow = {
  quest_id: string;
  completed_at: string | null;
  quest: { title: string; rarity: string; xp_reward: number } | { title: string; rarity: string; xp_reward: number }[] | null;
};

const RARITY_COLORS: Record<string, string> = {
  common: '#9CA3AF',
  uncommon: '#34D399',
  rare: '#60A5FA',
  epic: '#A78BFA',
  legendary: '#FFD700',
  special: '#FB923C',
};

function RarityBadge({ rarity }: { rarity: string }) {
  const color = RARITY_COLORS[rarity.toLowerCase()] ?? '#9CA3AF';
  return (
    <View style={[rarityStyles.badge, { borderColor: color }]}>
      <Text style={[rarityStyles.label, { color }]}>{rarity.toUpperCase()}</Text>
    </View>
  );
}

const rarityStyles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ArchiveScreen() {
  const [quests, setQuests] = useState<CompletedQuest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      setError('Please sign in to view your archive.');
      setIsLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('user_quests')
      .select('quest_id, completed_at, quest:quests!inner(title, rarity, xp_reward)')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setQuests([]);
      setIsLoading(false);
      return;
    }

    const mapped: CompletedQuest[] = ((data ?? []) as CompletedQuestRow[])
      .map((row) => {
        const questData = Array.isArray(row.quest) ? row.quest[0] : row.quest;
        if (!questData || !row.completed_at) return null;
        return {
          quest_id: row.quest_id,
          completed_at: row.completed_at,
          quest_title: questData.title,
          rarity: questData.rarity,
          xp_reward: questData.xp_reward,
        };
      })
      .filter((item): item is CompletedQuest => Boolean(item));

    setQuests(mapped);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <CheckCircle color="#4667F5" size={22} strokeWidth={2.2} />
          <Text style={styles.title}>Archive</Text>
        </View>
        <Text style={styles.subtitle}>Every quest you've ever conquered.</Text>

        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color="#AAB4D4" size="small" />
            <Text style={styles.stateText}>Loading archive...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={quests}
            keyExtractor={(item) => item.quest_id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.stateContainer}>
                <CheckCircle color="#2A3040" size={40} strokeWidth={1.5} />
                <Text style={styles.stateText}>No completed quests yet.{'\n'}Go find one!</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.questCard}>
                <View style={styles.cardTop}>
                  <Text style={styles.questTitle} numberOfLines={2}>
                    {item.quest_title}
                  </Text>
                  <RarityBadge rarity={item.rarity} />
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.xpText}>+{item.xp_reward} XP</Text>
                  {item.completed_at ? (
                    <Text style={styles.dateText}>{formatDate(item.completed_at)}</Text>
                  ) : null}
                </View>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    color: '#F6F8FE',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#AAB3C8',
    fontSize: 13,
    marginBottom: 14,
  },
  listContent: {
    paddingBottom: 140,
    gap: 10,
  },
  questCard: {
    backgroundColor: '#171B25',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  questTitle: {
    color: '#F6F8FE',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  xpText: {
    color: '#4667F5',
    fontSize: 13,
    fontWeight: '700',
  },
  dateText: {
    color: '#8891AA',
    fontSize: 12,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 40,
  },
  stateText: {
    textAlign: 'center',
    color: '#98A1B8',
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    textAlign: 'center',
    color: '#F4A3A3',
    fontSize: 14,
  },
});
