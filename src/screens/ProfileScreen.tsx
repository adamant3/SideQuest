import { Shield, Star, Trophy } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase/client';

type Profile = {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  total_xp: number;
  rank: string;
};

type TrophyPhoto = {
  quest_id: string;
  proof_image_url: string;
  quest_title: string;
};

type CompletedQuestRow = {
  quest_id: string;
  proof_image_url: string | null;
  quest: { title: string } | { title: string }[] | null;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const TROPHY_NUM_COLUMNS = 3;
const TROPHY_GAP_SIZE = 4;
const TROPHY_CELL_SIZE = (SCREEN_WIDTH - TROPHY_GAP_SIZE * (TROPHY_NUM_COLUMNS - 1)) / TROPHY_NUM_COLUMNS;

const XP_RANK_THRESHOLDS = { adventurer: 500, legend: 1500 } as const;

function getRankName(xp: number): string {
  if (xp <= XP_RANK_THRESHOLDS.adventurer) return 'Novice';
  if (xp <= XP_RANK_THRESHOLDS.legend) return 'Adventurer';
  return 'Legend';
}

function getRankColor(rankName: string): string {
  switch (rankName) {
    case 'Legend':
      return '#FFD700';
    case 'Adventurer':
      return '#A78BFA';
    default:
      return '#6B7280';
  }
}

function XpBar({ xp }: { xp: number }) {
  let progress = 0;

  if (xp <= XP_RANK_THRESHOLDS.adventurer) {
    progress = xp / XP_RANK_THRESHOLDS.adventurer;
  } else if (xp <= XP_RANK_THRESHOLDS.legend) {
    progress = (xp - XP_RANK_THRESHOLDS.adventurer) / (XP_RANK_THRESHOLDS.legend - XP_RANK_THRESHOLDS.adventurer);
  } else {
    progress = 1;
  }

  const nextThreshold =
    xp <= XP_RANK_THRESHOLDS.adventurer
      ? XP_RANK_THRESHOLDS.adventurer
      : xp <= XP_RANK_THRESHOLDS.legend
        ? XP_RANK_THRESHOLDS.legend
        : null;
  const label = nextThreshold
    ? `${xp.toLocaleString()} / ${nextThreshold.toLocaleString()} XP`
    : `${xp.toLocaleString()} XP (Max Rank)`;

  return (
    <View style={xpBarStyles.container}>
      <View style={xpBarStyles.track}>
        <View style={[xpBarStyles.fill, { width: `${Math.min(progress * 100, 100)}%` }]} />
      </View>
      <Text style={xpBarStyles.label}>{label}</Text>
    </View>
  );
}

const xpBarStyles = StyleSheet.create({
  container: { marginTop: 8, gap: 4 },
  track: {
    height: 6,
    backgroundColor: '#2A3040',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#4667F5',
    borderRadius: 3,
  },
  label: {
    color: '#8891AA',
    fontSize: 11,
  },
});

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trophyPhotos, setTrophyPhotos] = useState<TrophyPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out failed:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      setError('Please sign in to view your profile.');
      setIsLoading(false);
      return;
    }

    const [profileResult, questsResult] = await Promise.all([
      supabase.from('profiles').select('id, username, bio, avatar_url, total_xp, rank').eq('id', user.id).maybeSingle(),
      supabase
        .from('user_quests')
        .select('quest_id, proof_image_url, quest:quests!inner(title)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('proof_image_url', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(30),
    ]);

    if (profileResult.error) {
      setError(profileResult.error.message);
      setIsLoading(false);
      return;
    }

    let resolvedProfile = profileResult.data as Profile | null;

    if (!resolvedProfile) {
      const fallbackUsername =
        user.user_metadata?.username ??
        user.user_metadata?.display_name ??
        user.email?.split('@')[0] ??
        `user_${user.id.slice(0, 8)}`;
      const { data: createdProfile, error: createProfileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            username: fallbackUsername,
            total_xp: 0,
          },
          { onConflict: 'id' }
        )
        .select('id, username, bio, avatar_url, total_xp, rank')
        .maybeSingle();

      if (createProfileError) {
        setError(createProfileError.message);
        setIsLoading(false);
        return;
      }

      resolvedProfile = createdProfile as Profile | null;
    }

    if (!resolvedProfile) {
      setError('Profile not found.');
      setIsLoading(false);
      return;
    }

    setProfile(resolvedProfile);

    const photos: TrophyPhoto[] = ((questsResult.data ?? []) as CompletedQuestRow[])
      .filter((row) => Boolean(row.proof_image_url))
      .map((row) => {
        const questData = Array.isArray(row.quest) ? row.quest[0] : row.quest;
        return {
          quest_id: row.quest_id,
          proof_image_url: row.proof_image_url as string,
          quest_title: questData?.title ?? 'Quest',
        };
      });

    setTrophyPhotos(photos);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#AAB4D4" size="small" />
          <Text style={styles.stateText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.stateContainer}>
          <Text style={styles.errorText}>{error ?? 'Profile not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rankName = getRankName(profile.total_xp);
  const rankColor = getRankColor(rankName);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{profile.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.username}>{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </View>
        </View>

        {/* Rank & XP */}
        <View style={styles.rankCard}>
          <View style={styles.rankRow}>
            <Shield color={rankColor} size={20} strokeWidth={2} />
            <Text style={[styles.rankName, { color: rankColor }]}>{rankName}</Text>
            <View style={styles.xpBadge}>
              <Star color="#FFD700" size={13} strokeWidth={2} />
              <Text style={styles.xpBadgeText}>{profile.total_xp.toLocaleString()} XP</Text>
            </View>
          </View>
          <XpBar xp={profile.total_xp} />
        </View>

        {/* Trophy Wall */}
        <View style={styles.sectionHeader}>
          <Trophy color="#FFD700" size={18} strokeWidth={2} />
          <Text style={styles.sectionTitle}>Trophy Wall</Text>
          <Text style={styles.sectionCount}>{trophyPhotos.length}</Text>
        </View>

        {trophyPhotos.length === 0 ? (
          <View style={styles.emptyTrophy}>
            <Trophy color="#2A3040" size={40} strokeWidth={1.5} />
            <Text style={styles.emptyTrophyText}>Complete quests with proof to fill your Trophy Wall.</Text>
          </View>
        ) : (
          <FlatList
            data={trophyPhotos}
            keyExtractor={(item) => item.quest_id}
            numColumns={TROPHY_NUM_COLUMNS}
            scrollEnabled={false}
            columnWrapperStyle={styles.trophyRow}
            contentContainerStyle={styles.trophyGrid}
            renderItem={({ item }) => (
              <View style={styles.trophyCell}>
                <Image
                  source={{ uri: item.proof_image_url }}
                  style={styles.trophyImage}
                  resizeMode="cover"
                />
              </View>
            )}
          />
        )}

        <Pressable
          onPress={handleSignOut}
          disabled={isSigningOut}
          style={({ pressed }) => [styles.signOutButton, (pressed || isSigningOut) && styles.signOutButtonPressed]}>
          <Text style={styles.signOutLabel}>{isSigningOut ? 'Signing out…' : 'Sign Out'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F1117',
    width: '100%',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 140,
    gap: 12,
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B25',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2A3040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#AAB4D4',
    fontSize: 24,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  username: {
    color: '#F6F8FE',
    fontSize: 20,
    fontWeight: '700',
  },
  bio: {
    color: '#AAB3C8',
    fontSize: 13,
    lineHeight: 18,
  },
  rankCard: {
    backgroundColor: '#171B25',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 16,
    padding: 16,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankName: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2A3040',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  xpBadgeText: {
    color: '#F6F8FE',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#F6F8FE',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  sectionCount: {
    color: '#8891AA',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyTrophy: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyTrophyText: {
    color: '#8891AA',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 19,
  },
  trophyGrid: {
    gap: 4,
  },
  trophyRow: {
    gap: 4,
  },
  trophyCell: {
    width: TROPHY_CELL_SIZE,
    height: TROPHY_CELL_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2A3040',
  },
  trophyImage: {
    width: '100%',
    height: '100%',
  },
  signOutButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3040',
    backgroundColor: '#171B25',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutButtonPressed: {
    opacity: 0.7,
  },
  signOutLabel: {
    color: '#8891AA',
    fontSize: 14,
    fontWeight: '600',
  },
});
