import { Medal, Trophy, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAvatarPublicUrl } from '@/src/lib/supabase/avatar';
import { supabase } from '@/src/lib/supabase/client';

type LeaderboardEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  xp: number;
  position: number;
};

type GlobalRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_xp: number;
  global_position: number;
};

type MonthlyRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  month_xp: number;
  monthly_position: number;
};

const MEDAL_COLORS: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
};

function RankBadge({ position }: { position: number }) {
  if (position <= 3) {
    return <Trophy color={MEDAL_COLORS[position]} size={20} strokeWidth={2} />;
  }
  return <Text style={styles.rankNumber}>#{position}</Text>;
}

export default function RanksScreen() {
  const [activeTab, setActiveTab] = useState<'global' | 'monthly'>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedAvatarUserIds, setFailedAvatarUserIds] = useState<Set<string>>(new Set());

  const loadLeaderboard = useCallback(async (tab: 'global' | 'monthly') => {
    setIsLoading(true);
    setError(null);
    setFailedAvatarUserIds(new Set());

    const { data: userData } = await supabase.auth.getUser();
    setCurrentUserId(userData.user?.id ?? null);

    if (tab === 'global') {
      const { data, error: fetchError } = await supabase
        .from('leaderboard_global')
        .select('user_id, username, avatar_url, total_xp, global_position')
        .order('global_position', { ascending: true })
        .limit(100);

      if (fetchError) {
        setError(fetchError.message);
        setEntries([]);
      } else {
        setEntries(
          ((data ?? []) as GlobalRow[]).map((row) => ({
            user_id: row.user_id,
            username: row.username,
            avatar_url: row.avatar_url,
            xp: row.total_xp,
            position: row.global_position,
          }))
        );
      }
    } else {
      const { data, error: fetchError } = await supabase
        .from('leaderboard_monthly')
        .select('user_id, username, avatar_url, month_xp, monthly_position')
        .order('monthly_position', { ascending: true })
        .limit(100);

      if (fetchError) {
        setError(fetchError.message);
        setEntries([]);
      } else {
        setEntries(
          ((data ?? []) as MonthlyRow[]).map((row) => ({
            user_id: row.user_id,
            username: row.username,
            avatar_url: row.avatar_url,
            xp: row.month_xp,
            position: row.monthly_position,
          }))
        );
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadLeaderboard(activeTab);
  }, [activeTab, loadLeaderboard]);

  const handleTabChange = (tab: 'global' | 'monthly') => {
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerContent}>
          <View style={styles.header}>
            <Medal color="#4667F5" size={22} strokeWidth={2.2} />
            <Text style={styles.title}>Leaderboard</Text>
          </View>
        </View>

        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'global' && styles.tabActive]}
            onPress={() => handleTabChange('global')}>
            <Text style={[styles.tabLabel, activeTab === 'global' && styles.tabLabelActive]}>Global</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'monthly' && styles.tabActive]}
            onPress={() => handleTabChange('monthly')}>
            <Text style={[styles.tabLabel, activeTab === 'monthly' && styles.tabLabelActive]}>Monthly</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color="#AAB4D4" size="small" />
            <Text style={styles.stateText}>Loading leaderboard...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.stateText}>
                {activeTab === 'monthly' ? 'No activity this month yet.' : 'No players yet.'}
              </Text>
            }
            renderItem={({ item }) => {
              const isCurrentUser = item.user_id === currentUserId;
              const avatarUrl = getAvatarPublicUrl(item.avatar_url);
              const showFallback = !avatarUrl || failedAvatarUserIds.has(item.user_id);
              return (
                <View style={[styles.entryRow, isCurrentUser && styles.entryRowHighlight]}>
                  <View style={styles.badgeContainer}>
                    <RankBadge position={item.position} />
                  </View>
                  <View style={styles.avatarCircle}>
                    {showFallback ? (
                      <User color="#98A1B8" size={17} strokeWidth={2} />
                    ) : (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatarImage}
                        resizeMode="cover"
                        onError={() =>
                          setFailedAvatarUserIds((prev) => {
                            const next = new Set(prev);
                            next.add(item.user_id);
                            return next;
                          })
                        }
                      />
                    )}
                  </View>
                  <View style={styles.entryInfo}>
                    <Text style={[styles.entryUsername, isCurrentUser && styles.entryUsernameHighlight]}>
                      {item.username}
                      {isCurrentUser ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.entryXp}>
                      {item.xp.toLocaleString()} {activeTab === 'monthly' ? 'XP this month' : 'XP'}
                    </Text>
                  </View>
                  {item.position <= 3 && (
                    <View style={[styles.topBadge, { borderColor: MEDAL_COLORS[item.position] }]}>
                      <Text style={[styles.topBadgeText, { color: MEDAL_COLORS[item.position] }]}>
                        #{item.position}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }}
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
    width: '100%',
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0F1117',
    paddingTop: 12,
  },
  headerContent: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    color: '#F6F8FE',
    fontSize: 24,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#171B25',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3040',
    padding: 4,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#4667F5',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8891AA',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 140,
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B25',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    marginHorizontal: 16,
  },
  entryRowHighlight: {
    borderColor: '#4667F5',
    backgroundColor: '#1A2240',
  },
  badgeContainer: {
    width: 28,
    alignItems: 'center',
  },
  rankNumber: {
    color: '#8891AA',
    fontSize: 13,
    fontWeight: '700',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2A3040',
    borderWidth: 1,
    borderColor: '#3A4157',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: '#AAB4D4',
    fontSize: 16,
    fontWeight: '700',
  },
  entryInfo: {
    flex: 1,
  },
  entryUsername: {
    color: '#F6F8FE',
    fontSize: 15,
    fontWeight: '600',
  },
  entryUsernameHighlight: {
    color: '#7B9BFF',
  },
  entryXp: {
    color: '#8891AA',
    fontSize: 12,
    marginTop: 2,
  },
  topBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  topBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stateText: {
    textAlign: 'center',
    color: '#98A1B8',
    fontSize: 14,
  },
  errorText: {
    textAlign: 'center',
    color: '#F4A3A3',
    fontSize: 14,
  },
});
