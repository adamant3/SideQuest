import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/src/lib/supabase/client';

type SetupProfileScreenProps = {
  onComplete: () => void;
};

const USERNAME_PATTERN = /^[a-z0-9._]+$/;
const AVATAR_BUCKET_NAME = 'avatars';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type ReactNativeFormDataFile = {
  uri: string;
  name: string;
  type: string;
};

function cleanLocalFileUri(uri: string): string {
  const cleaned = uri.trim();

  if (
    cleaned.startsWith('file://') ||
    cleaned.startsWith('content://') ||
    cleaned.startsWith('http://') ||
    cleaned.startsWith('https://')
  ) {
    return cleaned;
  }

  if (cleaned.startsWith('/')) {
    return `file://${cleaned}`;
  }

  return cleaned;
}

export default function SetupProfileScreen({ onComplete }: SetupProfileScreenProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);

  const normalizedUsername = useMemo(() => username.trim().toLowerCase(), [username]);
  const usernameLooksValid = useMemo(
    () => normalizedUsername.length > 0 && USERNAME_PATTERN.test(normalizedUsername),
    [normalizedUsername]
  );

  useEffect(() => {
    let active = true;

    const loadProfileDefaults = async () => {
      setIsLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;

      if (!active) {
        return;
      }

      if (userError || !user) {
        Alert.alert('Sign in required', 'Please sign in again.');
        setIsLoading(false);
        return;
      }

      setUserId(user.id);

      const fallbackUsername = `user_${user.id.slice(0, 8).toLowerCase()}`;
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, bio, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (profileError) {
        Alert.alert('Profile load failed', profileError.message);
        setUsername(fallbackUsername);
        setBio('');
        setAvatarUri(null);
        setIsLoading(false);
        return;
      }

      const existing = profileData;
      setUsername(existing?.username ?? fallbackUsername);
      setBio(existing?.bio ?? '');
      setAvatarUri(existing?.avatar_url ?? null);
      setIsLoading(false);
    };

    loadProfileDefaults();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    if (!normalizedUsername) {
      setIsCheckingUsername(false);
      setIsUsernameAvailable(null);
      return;
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setIsCheckingUsername(false);
      setIsUsernameAvailable(false);
      return;
    }

    let active = true;
    setIsCheckingUsername(true);

    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .neq('id', userId)
        .limit(1);

      if (!active) {
        return;
      }

      if (error) {
        console.error('Username uniqueness check failed:', error.message);
        setIsUsernameAvailable(null);
      } else {
        setIsUsernameAvailable((data ?? []).length === 0);
      }

      setIsCheckingUsername(false);
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalizedUsername, userId]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    setAvatarUri(result.assets[0].uri);
  };

  const uploadAvatarIfNeeded = async () => {
    if (!avatarUri || !userId) {
      return null;
    }

    if (avatarUri.startsWith('http://') || avatarUri.startsWith('https://')) {
      return avatarUri;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (sessionError || !session?.access_token) {
      throw new Error(sessionError?.message ?? 'Could not get an authenticated session.');
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration is missing.');
    }

    const cleanedAvatarUri = cleanLocalFileUri(avatarUri);
    const fileName = `avatar_${Date.now()}.jpg`;
    const filePath = `${userId}/${fileName}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${AVATAR_BUCKET_NAME}/${filePath}`;

    const formData = new FormData();
    const formDataFile: ReactNativeFormDataFile = {
      uri: cleanedAvatarUri,
      name: fileName,
      type: 'image/jpeg',
    };
    // React Native accepts this object shape for file uploads in FormData.
    formData.append('file', formDataFile as any);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const responseText = await uploadResponse.text();
      let exactError = responseText.trim();

      if (exactError) {
        try {
          const parsed = JSON.parse(responseText) as
            | { message?: string; error?: string; error_description?: string }
            | null;
          exactError =
            parsed?.message?.trim() ||
            parsed?.error_description?.trim() ||
            parsed?.error?.trim() ||
            exactError;
        } catch {
          // Keep raw response text when it is not JSON.
        }
      }

      throw new Error(exactError || `Avatar upload failed with status ${uploadResponse.status}`);
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSaveProfile = async () => {
    if (isSaving) {
      return;
    }

    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again.');
      return;
    }

    if (!normalizedUsername) {
      Alert.alert('Username required', 'Please choose a username.');
      return;
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      Alert.alert(
        'Invalid username',
        'Use only lowercase letters, numbers, underscores (_), and periods (.).'
      );
      return;
    }

    if (isUsernameAvailable === false) {
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }

    setIsSaving(true);

    try {
      let uploadedAvatarUrl: string | null = null;
      try {
        uploadedAvatarUrl = await uploadAvatarIfNeeded();
      } catch (err) {
        Alert.alert('Avatar upload failed', err instanceof Error ? err.message : String(err));
        return;
      }

      const { error } = await supabase.from('profiles').upsert(
        {
          id: userId,
          username: normalizedUsername,
          bio: bio.trim() || null,
          avatar_url: uploadedAvatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) {
        throw new Error(error.message);
      }

      onComplete();
    } catch (err) {
      Alert.alert('Could not save profile', err instanceof Error ? err.message : 'Unknown error.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#AAB4D4" size="small" />
          <Text style={styles.stateText}>Loading onboarding...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.headerCard}>
            <Text style={styles.title}>Set up your profile</Text>
            <Text style={styles.subtitle}>Choose your identity before entering SideQuest.</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Profile Picture</Text>
            <Pressable onPress={pickAvatar} style={({ pressed }) => [styles.avatarPicker, pressed && styles.pressed]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarPlaceholder}>Choose Avatar</Text>
              )}
            </Pressable>

            <Text style={[styles.label, styles.spacedLabel]}>Username</Text>
            <TextInput
              value={username}
              onChangeText={(value) => setUsername(value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your.username"
              placeholderTextColor="#5F6883"
              style={styles.input}
            />
            {!normalizedUsername ? (
              <Text style={styles.helperText}>Required.</Text>
            ) : !usernameLooksValid ? (
              <Text style={styles.errorText}>Only lowercase letters, numbers, _ and . are allowed.</Text>
            ) : isCheckingUsername ? (
              <Text style={styles.helperText}>Checking availability...</Text>
            ) : isUsernameAvailable ? (
              <Text style={styles.successText}>Username is available.</Text>
            ) : (
              <Text style={styles.errorText}>Username is already taken.</Text>
            )}

            <Text style={[styles.label, styles.spacedLabel]}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Tell adventurers about yourself..."
              placeholderTextColor="#5F6883"
              style={[styles.input, styles.bioInput]}
              multiline
              maxLength={160}
            />

            <Pressable
              onPress={handleSaveProfile}
              disabled={isSaving || !usernameLooksValid || isUsernameAvailable === false}
              style={({ pressed }) => [styles.saveButton, (pressed || isSaving) && styles.pressed]}>
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Continue</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 20,
    gap: 12,
  },
  headerCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3040',
    backgroundColor: '#171B25',
    padding: 16,
  },
  title: {
    color: '#F6F8FE',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 4,
  },
  subtitle: {
    color: '#AAB3C8',
    fontSize: 13,
    marginTop: 6,
  },
  formCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3040',
    backgroundColor: '#171B25',
    padding: 16,
  },
  label: {
    color: '#A9B2CA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  spacedLabel: {
    marginTop: 14,
  },
  avatarPicker: {
    marginTop: 8,
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: '#2A3040',
    backgroundColor: '#202534',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    color: '#AAB4D4',
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    marginTop: 8,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3040',
    backgroundColor: '#101420',
    paddingHorizontal: 12,
    color: '#F6F8FE',
    fontSize: 15,
  },
  bioInput: {
    height: 92,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  helperText: {
    marginTop: 6,
    color: '#8891AA',
    fontSize: 12,
  },
  successText: {
    marginTop: 6,
    color: '#7EE2A8',
    fontSize: 12,
  },
  errorText: {
    marginTop: 6,
    color: '#F4A3A3',
    fontSize: 12,
  },
  saveButton: {
    marginTop: 18,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#4667F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
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
});
