import { Compass, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) {
          Alert.alert('Sign in failed', error.message);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) {
          Alert.alert('Sign up failed', error.message);
          return;
        }

        if (data.user) {
          // Only attempt direct profile creation when an authenticated session is present.
          // Some Supabase setups require auth.uid() in RLS policies and return null during
          // email-confirmation sign-up flows (session can be null).
          if (data.session) {
            const { error: profileError } = await supabase.from('profiles').upsert(
              {
                id: data.user.id,
                username: `user_${data.user.id.slice(0, 8)}`,
                total_xp: 0,
              },
              { onConflict: 'id', ignoreDuplicates: true }
            );

            if (profileError) {
              console.warn('Profile creation failed (will retry on profile screen):', profileError.message);
            }
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Hero / Logo */}
          <View style={styles.heroSection}>
            <View style={styles.logoRing}>
              <Compass size={40} color="#4667F5" strokeWidth={1.8} />
            </View>
            <Text style={styles.appName}>SIDEQUEST</Text>
            <Text style={styles.tagline}>Your adventure awaits.</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <Pressable
              onPress={() => setMode('sign-in')}
              style={[styles.toggleButton, mode === 'sign-in' && styles.toggleButtonActive]}>
              <Text style={[styles.toggleLabel, mode === 'sign-in' && styles.toggleLabelActive]}>Sign In</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('sign-up')}
              style={[styles.toggleButton, mode === 'sign-up' && styles.toggleButtonActive]}>
              <Text style={[styles.toggleLabel, mode === 'sign-up' && styles.toggleLabelActive]}>Sign Up</Text>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="hero@example.com"
              placeholderTextColor="#444D62"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#444D62"
              secureTextEntry
              editable={!isLoading}
            />

            <Pressable
              onPress={handleAuth}
              disabled={isLoading}
              style={({ pressed }) => [styles.submitButton, (pressed || isLoading) && styles.submitButtonPressed]}>
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Zap size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.submitLabel}>
                    {mode === 'sign-in' ? 'Enter the World' : 'Begin Your Quest'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={styles.switchHint}>
            {mode === 'sign-in' ? 'New adventurer? ' : 'Already have an account? '}
            <Text style={styles.switchLink} onPress={switchMode}>
              {mode === 'sign-in' ? 'Create account' : 'Sign in'}
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0D14',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
  },
  heroSection: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  logoRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#263A83',
    backgroundColor: '#11152A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  appName: {
    color: '#F6F8FE',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 8,
  },
  tagline: {
    color: '#5A6484',
    fontSize: 14,
    letterSpacing: 1.2,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#161921',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E2438',
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#4667F5',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5A6484',
  },
  toggleLabelActive: {
    color: '#FFFFFF',
  },
  formCard: {
    backgroundColor: '#13161F',
    borderWidth: 1,
    borderColor: '#1E2438',
    borderRadius: 20,
    padding: 20,
  },
  inputLabel: {
    color: '#4A5370',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  inputLabelSpaced: {
    marginTop: 14,
  },
  input: {
    height: 48,
    backgroundColor: '#0D1018',
    borderWidth: 1,
    borderColor: '#232840',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#E8EEFF',
    fontSize: 15,
    marginTop: 6,
  },
  submitButton: {
    marginTop: 22,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#4667F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonPressed: {
    opacity: 0.8,
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  switchHint: {
    textAlign: 'center',
    color: '#4A5370',
    fontSize: 13,
  },
  switchLink: {
    color: '#4667F5',
    fontWeight: '600',
  },
});
