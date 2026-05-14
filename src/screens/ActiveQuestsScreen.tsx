import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase/client';

type ActiveQuest = {
  id: string;
  title: string;
  description: string;
  rarity: string;
  xp_reward: number;
  location_lat: number | null;
  location_long: number | null;
};

type ActiveQuestRow = {
  quest_id: string;
  created_at: string;
  quest: ActiveQuest | ActiveQuest[];
};

type QuestAssignment = {
  questId: string;
  createdAt: string;
  quest: ActiveQuest;
};

const QUEST_VERIFICATION_RADIUS_METERS = 100;
const QUEST_PROOF_PHOTO_COMPRESSION = 0.7;
const XP_UPDATE_MAX_RETRIES = 3;
const UNKNOWN_RARITY_LABEL = 'unknown';

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

export default function ActiveQuestsScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [quests, setQuests] = useState<QuestAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingQuestId, setVerifyingQuestId] = useState<string | null>(null);
  const [pendingQuest, setPendingQuest] = useState<QuestAssignment | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadActiveQuests = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      setError('Please sign in to view active quests.');
      setQuests([]);
      setIsLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('user_quests')
      .select(
        'quest_id, created_at, quest:quests!inner(id, title, description, rarity, xp_reward, location_lat, location_long)'
      )
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setQuests([]);
      setIsLoading(false);
      return;
    }

    const mappedQuests: QuestAssignment[] = ((data ?? []) as ActiveQuestRow[])
      .map((row) => {
        const joinedQuest = Array.isArray(row.quest) ? row.quest[0] : row.quest;

        if (!joinedQuest) {
          return null;
        }

        return {
          questId: row.quest_id,
          createdAt: row.created_at,
          quest: {
            ...joinedQuest,
            location_lat: joinedQuest.location_lat,
            location_long: joinedQuest.location_long,
          },
        };
      })
      .filter((item): item is QuestAssignment => Boolean(item));

    setQuests(mappedQuests);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadActiveQuests();
  }, [loadActiveQuests]);

  const completeQuestWithProof = useCallback(
    async (questAssignment: QuestAssignment, photoUri: string) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;

      if (userError || !user) {
        throw new Error('Please sign in to verify quest completion.');
      }

      let uploadedFilePath: string | null = null;
      let questMarkedCompleted = false;

      try {
        const fileResponse = await fetch(photoUri);
        const photoBlob = await fileResponse.blob();
        const filePath = `${user.id}/${questAssignment.questId}-${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('quest-proofs')
          .upload(filePath, photoBlob, { contentType: 'image/jpeg', upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        uploadedFilePath = filePath;

        const { data: publicUrlData } = supabase.storage.from('quest-proofs').getPublicUrl(filePath);

        const { error: completeError } = await supabase
          .from('user_quests')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            proof_image_url: publicUrlData.publicUrl,
          })
          .eq('user_id', user.id)
          .eq('quest_id', questAssignment.questId)
          .eq('status', 'active');

        if (completeError) {
          throw new Error(completeError.message);
        }

        questMarkedCompleted = true;

        for (let attempt = 0; attempt < XP_UPDATE_MAX_RETRIES; attempt += 1) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('total_xp')
            .eq('id', user.id)
            .single();

          if (profileError) {
            throw new Error(profileError.message);
          }

          const currentXp = profile?.total_xp ?? 0;
          const nextXp = currentXp + questAssignment.quest.xp_reward;

          const { data: updateResult, error: updateXpError } = await supabase
            .from('profiles')
            .update({
              total_xp: nextXp,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)
            .eq('total_xp', currentXp)
            .select('id');

          if (updateXpError) {
            throw new Error(updateXpError.message);
          }

          if (updateResult && updateResult.length > 0) {
            return;
          }
        }

        throw new Error(`Could not update XP after ${XP_UPDATE_MAX_RETRIES} attempts. Please retry.`);
      } catch (err) {
        if (uploadedFilePath && !questMarkedCompleted) {
          await supabase.storage.from('quest-proofs').remove([uploadedFilePath]);
        }
        throw err;
      }
    },
    []
  );

  const handleVerifyPress = useCallback(
    async (questAssignment: QuestAssignment) => {
      const quest = questAssignment.quest;

      if (quest.location_lat === null || quest.location_long === null) {
        Alert.alert('Missing quest location', 'This quest does not have a valid location to verify.');
        return;
      }

      setVerifyingQuestId(questAssignment.questId);

      try {
        const locationPermission = await Location.requestForegroundPermissionsAsync();
        if (locationPermission.status !== 'granted') {
          Alert.alert('Location permission required', 'Enable location access to verify this quest.');
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const distanceMeters = haversineDistanceMeters(
          currentPosition.coords.latitude,
          currentPosition.coords.longitude,
          quest.location_lat,
          quest.location_long
        );

        if (distanceMeters > QUEST_VERIFICATION_RADIUS_METERS) {
          Alert.alert(
            'Too far from quest location',
            `Move closer to the quest location (within ${QUEST_VERIFICATION_RADIUS_METERS}m). You are currently ${Math.round(distanceMeters)}m away.`
          );
          return;
        }

        if (!cameraPermission?.granted) {
          const cameraResult = await requestCameraPermission();
          if (!cameraResult.granted) {
            Alert.alert('Camera permission required', 'Enable camera access to submit quest proof.');
            return;
          }
        }

        setPendingQuest(questAssignment);
        setCameraVisible(true);
      } catch (err) {
        Alert.alert('Verification failed', err instanceof Error ? err.message : 'Unknown error.');
      } finally {
        setVerifyingQuestId(null);
      }
    },
    [cameraPermission, requestCameraPermission]
  );

  const handleCaptureProof = useCallback(async () => {
    if (!cameraRef.current || !pendingQuest) {
      return;
    }

    setIsSubmittingProof(true);

    try {
      const earnedXp = pendingQuest.quest.xp_reward;
      const photo = await cameraRef.current.takePictureAsync({ quality: QUEST_PROOF_PHOTO_COMPRESSION });

      if (!photo?.uri) {
        throw new Error('No photo was captured.');
      }

      await completeQuestWithProof(pendingQuest, photo.uri);

      setCameraVisible(false);
      setPendingQuest(null);
      await loadActiveQuests();
      setSuccessMessage(`Quest completed! +${earnedXp} XP`);
    } catch (err) {
      Alert.alert('Unable to complete quest', err instanceof Error ? err.message : 'Unknown error.');
    } finally {
      setIsSubmittingProof(false);
    }
  }, [completeQuestWithProof, loadActiveQuests, pendingQuest]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Active Quests</Text>
          <Text style={styles.subtitle}>Verify completion with location + photo proof.</Text>
        </View>

        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color="#AAB4D4" size="small" />
            <Text style={styles.stateText}>Loading active quests...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={quests}
            keyExtractor={(item) => item.questId}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.stateText}>You have no active quests.</Text>}
            renderItem={({ item }) => (
              <View style={styles.questCard}>
                <Text style={styles.questTitle}>{item.quest.title}</Text>
                <Text style={styles.questMeta}>
                  {(item.quest.rarity ?? UNKNOWN_RARITY_LABEL).toUpperCase()} • {item.quest.xp_reward} XP
                </Text>
                <Text numberOfLines={2} style={styles.questDescription}>
                  {item.quest.description}
                </Text>

                <Pressable
                  onPress={() => handleVerifyPress(item)}
                  disabled={verifyingQuestId === item.questId}
                  style={({ pressed }) => [
                    styles.verifyButton,
                    (pressed || verifyingQuestId === item.questId) && styles.verifyButtonPressed,
                  ]}>
                  {verifyingQuestId === item.questId ? (
                    <ActivityIndicator color="#F6F8FE" size="small" />
                  ) : (
                    <Text style={styles.verifyButtonText}>Verify Completion</Text>
                  )}
                </Pressable>
              </View>
            )}
          />
        )}
      </View>

      <Modal
        visible={cameraVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingProof) {
            setCameraVisible(false);
            setPendingQuest(null);
          }
        }}>
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" />
          <View style={styles.cameraActions}>
            <Pressable
              disabled={isSubmittingProof}
              onPress={() => {
                if (isSubmittingProof) {
                  return;
                }
                setCameraVisible(false);
                setPendingQuest(null);
              }}
              style={({ pressed }) => [styles.cameraButtonSecondary, pressed && styles.cameraButtonPressed]}>
              <Text style={styles.cameraButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              disabled={isSubmittingProof}
              onPress={handleCaptureProof}
              style={({ pressed }) => [styles.cameraButtonPrimary, pressed && styles.cameraButtonPressed]}>
              {isSubmittingProof ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.cameraButtonText}>Capture Proof</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(successMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessMessage(null)}>
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Quest Complete 🎉</Text>
            <Text style={styles.successBody}>{successMessage}</Text>
            <Pressable onPress={() => setSuccessMessage(null)} style={styles.successButton}>
              <Text style={styles.successButtonText}>Awesome</Text>
            </Pressable>
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
    width: '100%',
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0F1117',
    paddingTop: 12,
  },
  title: {
    color: '#F6F8FE',
    fontSize: 24,
    fontWeight: '700',
  },
  headerContent: {
    paddingHorizontal: 20,
  },
  subtitle: {
    color: '#AAB3C8',
    fontSize: 13,
    marginTop: 6,
    marginBottom: 14,
  },
  listContent: {
    paddingBottom: 140,
    gap: 12,
  },
  questCard: {
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 16,
    backgroundColor: '#171B25',
    padding: 14,
  },
  questTitle: {
    color: '#F6F8FE',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  questMeta: {
    color: '#9FB0D6',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  questDescription: {
    color: '#C9D1E8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  verifyButton: {
    height: 42,
    borderRadius: 11,
    backgroundColor: '#4667F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonPressed: {
    opacity: 0.85,
  },
  verifyButtonText: {
    color: '#F6F8FE',
    fontSize: 14,
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
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPreview: {
    flex: 1,
  },
  cameraActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 22,
    backgroundColor: '#11131A',
  },
  cameraButtonPrimary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#4667F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButtonSecondary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#2A3040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButtonPressed: {
    opacity: 0.85,
  },
  cameraButtonText: {
    color: '#F6F8FE',
    fontSize: 14,
    fontWeight: '700',
  },
  successBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#171B25',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  successTitle: {
    color: '#F6F8FE',
    fontSize: 20,
    fontWeight: '700',
  },
  successBody: {
    color: '#CFD5E8',
    fontSize: 14,
    lineHeight: 20,
  },
  successButton: {
    marginTop: 4,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#4667F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    color: '#F6F8FE',
    fontSize: 14,
    fontWeight: '700',
  },
});
