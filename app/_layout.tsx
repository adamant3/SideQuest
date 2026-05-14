import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/src/context';
import AuthScreen from '@/src/screens/AuthScreen';
import { supabase } from '@/src/lib/supabase/client';
import SetupProfileScreen from '@/src/screens/SetupProfileScreen';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const colorScheme = useColorScheme();
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  useEffect(() => {
    let active = true;

    const checkProfileCompletion = async () => {
      if (!session) {
        setNeedsProfileSetup(false);
        setIsProfileLoading(false);
        return;
      }

      setIsProfileLoading(true);

      const userId = session.user.id;
      const fallbackUsername = `user_${userId.slice(0, 8).toLowerCase()}`;

      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        console.error('Failed to load profile for onboarding:', error.message);
        setNeedsProfileSetup(false);
        setIsProfileLoading(false);
        return;
      }

      if (!profileRow) {
        const { error: createError } = await supabase.from('profiles').upsert(
          {
            id: userId,
            username: fallbackUsername,
            total_xp: 0,
          },
          { onConflict: 'id' }
        );

        if (!active) {
          return;
        }

        if (createError) {
          console.error('Failed to create fallback profile for onboarding:', createError.message);
          setNeedsProfileSetup(false);
        } else {
          setNeedsProfileSetup(true);
        }

        setIsProfileLoading(false);
        return;
      }

      const normalizedUsername = (profileRow.username ?? '').trim().toLowerCase();
      setNeedsProfileSetup(!normalizedUsername || normalizedUsername === fallbackUsername);
      setIsProfileLoading(false);
    };

    checkProfileCompletion();

    return () => {
      active = false;
    };
  }, [session]);

  if (isLoading || isProfileLoading) {
    return null;
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (needsProfileSetup) {
    return <SetupProfileScreen onComplete={() => setNeedsProfileSetup(false)} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
