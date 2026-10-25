import { Orbitron_500Medium, Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import { Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BRLogo } from '@/components/BRLogo';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { DataProvider } from '@/providers/DataProvider';
import { configureNotifications } from '@/services/notifications';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Orbitron_500Medium,
    Orbitron_700Bold,
    Orbitron_900Black,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <DataProvider>
            <RootNavigator />
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { palette, contentOpacity } = useTheme();
  const { ready, session, profile, profileError, onboarded } = useAuth();
  const fade = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.bg[0]).catch(() => {});
  }, [palette.bg]);

  const gateResolved = ready && (!session || !!profile || profileError);
  useEffect(() => {
    if (gateResolved || !isSupabaseConfigured) SplashScreen.hideAsync().catch(() => {});
  }, [gateResolved]);

  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (!gateResolved) return <LogoSplash />;
  if (session && !profile) return <ProfileUnavailable />;

  const signedIn = !!session && !!profile;
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: palette.bg[0] }, fade]}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg[0] }, animation: 'fade_from_bottom' }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="store/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="task-new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ai-writer" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="event-new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="route-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="admin/stores" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="admin/team" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="credits" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="vehicle" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
    </Animated.View>
  );
}

/** Same crest, size and position as the native splash image, so the handoff is seamless. */
function LogoSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: '#03070F', alignItems: 'center', justifyContent: 'center' }}>
      <BRLogo size={SPLASH_LOGO_WIDTH} animated />
    </View>
  );
}

// app.json splash: imageWidth 200 with the crest filling 92% of a square canvas.
const SPLASH_LOGO_WIDTH = 200 * 0.92 * (200 / 220);

function SetupNeeded() {
  return (
    <Screen title="Almost ready" kicker="Setup">
      <Txt variant="body" tone="dim">
        This build has no Supabase connection yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.local for development, or as EAS
        environment variables for cloud builds, then rebuild.
      </Txt>
    </Screen>
  );
}

function ProfileUnavailable() {
  const { refreshProfile, signOut } = useAuth();
  return (
    <Screen title="Can't reach BOAROUTE" kicker="Connection">
      <Txt variant="body" tone="dim" style={{ marginBottom: 20 }}>
        Your account is signed in but your profile could not be loaded. Check your signal and try again.
      </Txt>
      <View style={{ gap: 12 }}>
        <NeonButton label="Try again" icon="refresh" onPress={() => refreshProfile().catch(() => {})} full />
        <NeonButton label="Sign out" variant="ghost" onPress={() => signOut().catch(() => {})} full />
      </View>
    </Screen>
  );
}
