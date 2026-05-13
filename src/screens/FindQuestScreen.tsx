import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Grid2x2, List, MapPin, Sparkles, X } from 'lucide-react-native';

import { supabase } from '@/src/lib/supabase/client';

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'special';
type ViewMode = 'grid' | 'list';
type XpFilter = 'all' | 'low' | 'mid' | 'high';

type Quest = {
  id: string;
  title: string;
  description: string;
  rarity: Rarity;
  xp_reward: number;
  location_lat: number | null;
  location_long: number | null;
  requirements: Record<string, unknown> | null;
};

function formatRequirements(requirements: Record<string, unknown> | null) {
  if (!requirements || Object.keys(requirements).length === 0) {
    return ['No requirements listed.'];
  }

  return Object.entries(requirements).map(([key, value]) => {
    const normalizedKey = key.replace(/_/g, ' ');
    const label = normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);

    if (Array.isArray(value)) {
      return `• ${label}: ${value.join(', ')}`;
    }

    if (typeof value === 'object' && value !== null) {
      return `• ${label}: ${JSON.stringify(value)}`;
    }

    return `• ${label}: ${String(value)}`;
  });
}

const rarityOptions: Array<'all' | Rarity> = [
  'all',
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'special',
];

const rarityColors: Record<Rarity, { border: string; text: string; badge: string; card: string }> = {
  common: { border: '#545B6B', text: '#B8BDD0', badge: '#343A45', card: '#1B1E27' },
  uncommon: { border: '#2DAA76', text: '#76E3B7', badge: '#1E3B33', card: '#192721' },
  rare: { border: '#3A78E0', text: '#8AB8FF', badge: '#23375C', card: '#182235' },
  epic: { border: '#8E54E9', text: '#C9A7FF', badge: '#352451', card: '#211A33' },
  legendary: { border: '#E0AD3A', text: '#FFD67E', badge: '#584728', card: '#2D2516' },
  special: { border: '#E14B9B', text: '#FF9FD1', badge: '#592740', card: '#301D29' },
};

const xpOptions: { value: XpFilter; label: string }[] = [
  { value: 'all', label: 'All XP' },
  { value: 'low', label: 'XP < 100' },
  { value: 'mid', label: '100-300 XP' },
  { value: 'high', label: 'XP > 300' },
];

export default function FindQuestScreen() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRarity, setSelectedRarity] = useState<'all' | Rarity>('all');
  const [selectedXpFilter, setSelectedXpFilter] = useState<XpFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);

  useEffect(() => {
    let active = true;

    const loadQuests = async () => {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('quests')
        .select('id, title, description, rarity, xp_reward, location_lat, location_long, requirements')
        .order('xp_reward', { ascending: false });

      if (!active) {
        return;
      }

      if (fetchError) {
        setError(fetchError.message);
        setQuests([]);
      } else {
        setQuests((data ?? []) as Quest[]);
      }

      setIsLoading(false);
    };

    loadQuests();

    return () => {
      active = false;
    };
  }, []);

  const filteredQuests = useMemo(() => {
    return quests.filter((quest) => {
      const rarityMatch = selectedRarity === 'all' || quest.rarity === selectedRarity;
      const xpMatch =
        selectedXpFilter === 'all' ||
        (selectedXpFilter === 'low' && quest.xp_reward < 100) ||
        (selectedXpFilter === 'mid' && quest.xp_reward >= 100 && quest.xp_reward <= 300) ||
        (selectedXpFilter === 'high' && quest.xp_reward > 300);

      return rarityMatch && xpMatch;
    });
  }, [quests, selectedRarity, selectedXpFilter]);

  const renderQuest = ({ item }: { item: Quest }) => {
    const rarityStyle = rarityColors[item.rarity] ?? rarityColors.common;

    return (
      <Pressable
        onPress={() => setSelectedQuest(item)}
        style={({ pressed }) => [
          styles.questCard,
          viewMode === 'grid' ? styles.questCardGrid : styles.questCardList,
          {
            borderColor: rarityStyle.border,
            backgroundColor: rarityStyle.card,
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <View style={styles.questHeader}>
          <Text numberOfLines={viewMode === 'grid' ? 2 : 1} style={styles.questTitle}>
            {item.title}
          </Text>
          <View style={[styles.rarityBadge, { backgroundColor: rarityStyle.badge }]}>
            <Text style={[styles.rarityText, { color: rarityStyle.text }]}>{item.rarity.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Sparkles size={14} color="#F5D061" strokeWidth={2.4} />
          <Text style={styles.metaText}>{item.xp_reward} XP</Text>
        </View>

        {viewMode === 'list' && (
          <>
            <Text numberOfLines={2} style={styles.descriptionText}>
              {item.description}
            </Text>
            {(item.location_lat !== null || item.location_long !== null) && (
              <View style={styles.metaRow}>
                <MapPin size={14} color="#AEB7CF" strokeWidth={2.2} />
                <Text style={styles.metaText}>
                  {item.location_lat ?? '--'}, {item.location_long ?? '--'}
                </Text>
              </View>
            )}
          </>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {rarityOptions.map((rarity) => {
              const active = rarity === selectedRarity;

              return (
                <Pressable
                  key={rarity}
                  onPress={() => setSelectedRarity(rarity)}
                  style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{rarity.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.secondaryBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.xpScroll}>
              {xpOptions.map((option) => {
                const active = option.value === selectedXpFilter;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setSelectedXpFilter(option.value)}
                    style={[styles.xpChip, active && styles.filterChipActive]}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.viewSwitch}>
              <Pressable
                onPress={() => setViewMode('grid')}
                style={[styles.switchButton, viewMode === 'grid' && styles.switchButtonActive]}>
                <Grid2x2 size={16} color={viewMode === 'grid' ? '#ffffff' : '#9098B0'} />
              </Pressable>
              <Pressable
                onPress={() => setViewMode('list')}
                style={[styles.switchButton, viewMode === 'list' && styles.switchButtonActive]}>
                <List size={16} color={viewMode === 'list' ? '#ffffff' : '#9098B0'} />
              </Pressable>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color="#AAB4D4" size="small" />
            <Text style={styles.stateText}>Loading quests...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorText}>Failed to load quests: {error}</Text>
          </View>
        ) : (
          <FlatList
            key={viewMode}
            data={filteredQuests}
            renderItem={renderQuest}
            keyExtractor={(item) => item.id}
            numColumns={viewMode === 'grid' ? 2 : 1}
            columnWrapperStyle={viewMode === 'grid' ? styles.gridWrapper : undefined}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.stateText}>No quests match your filters.</Text>}
          />
        )}
      </View>

      <Modal visible={Boolean(selectedQuest)} animationType="slide" transparent onRequestClose={() => setSelectedQuest(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedQuest?.title}</Text>
              <Pressable onPress={() => setSelectedQuest(null)} style={styles.closeButton}>
                <X size={18} color="#D5D9E5" />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Instructions</Text>
            <Text style={styles.modalBody}>{selectedQuest?.description}</Text>

            <Text style={styles.modalLabel}>Requirements</Text>
            {formatRequirements(selectedQuest?.requirements ?? null).map((requirement) => (
              <Text key={requirement} style={styles.modalBody}>
                {requirement}
              </Text>
            ))}
          </View>
        </View>
      </Modal>
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
    paddingTop: 10,
  },
  topBar: {
    gap: 10,
    marginBottom: 14,
  },
  filterScroll: {
    gap: 8,
    paddingRight: 6,
  },
  secondaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  xpScroll: {
    gap: 8,
    paddingRight: 6,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#2A2F3D',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1A1E29',
  },
  xpChip: {
    borderWidth: 1,
    borderColor: '#2A2F3D',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#1A1E29',
  },
  filterChipActive: {
    borderColor: '#5A78FF',
    backgroundColor: '#263A83',
  },
  filterText: {
    color: '#A7B0C7',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#F0F4FF',
  },
  viewSwitch: {
    flexDirection: 'row',
    backgroundColor: '#171A24',
    borderWidth: 1,
    borderColor: '#2A2F3D',
    borderRadius: 12,
    overflow: 'hidden',
  },
  switchButton: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchButtonActive: {
    backgroundColor: '#394E95',
  },
  listContent: {
    paddingBottom: 130,
  },
  gridWrapper: {
    justifyContent: 'space-between',
  },
  questCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  questCardGrid: {
    width: '48.4%',
    minHeight: 120,
  },
  questCardList: {
    width: '100%',
  },
  questHeader: {
    gap: 8,
    marginBottom: 8,
  },
  questTitle: {
    fontSize: 16,
    lineHeight: 20,
    color: '#F7F8FD',
    fontWeight: '700',
  },
  rarityBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    color: '#CFD5E8',
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionText: {
    marginTop: 2,
    marginBottom: 8,
    color: '#AAB3C8',
    fontSize: 13,
    lineHeight: 19,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  modalCard: {
    maxHeight: '80%',
    backgroundColor: '#171B25',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  modalTitle: {
    flex: 1,
    color: '#F6F8FE',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#252B38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLabel: {
    color: '#A9B2CA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  modalBody: {
    color: '#DEE4F4',
    fontSize: 14,
    lineHeight: 20,
  },
});
