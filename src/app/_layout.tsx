import { CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold, CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond';
import { Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CarAppService } from '@/car/CarAppService';
import { BRLogo } from '@/components/BRLogo';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { VisitAlarm } from '@/components/VisitAlarm';
import { WhatsNew } from '@/components/WhatsNew';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { DataProvider } from '@/providers/DataProvider';
import { configureNotifications } from '@/services/notifications';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications().catch(() => {});
CarAppService.start();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
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

// iOS-style parallax push on Android too: smoother than the stock slide.
const PUSH = Platform.OS === 'android' ? 'ios_from_right' : 'default';

function RootNavigator() {
  const { palette, contentOpacity } = useTheme();
  const { ready, session, profile, profileError, onboarded, isMember } = useAuth();
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

  // Pending or denied sign-ups stay on the sign-in screen, which explains why.
  const signedIn = !!session && !!profile && isMember;
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: palette.bg[0] }, fade]}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg[0] }, animation: 'fade' }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="store/[id]" options={{ animation: PUSH }} />
          <Stack.Screen name="task-new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ai-writer" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="event-new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="route-settings" options={{ animation: PUSH }} />
          <Stack.Screen name="admin/stores" options={{ animation: PUSH }} />
          <Stack.Screen name="admin/team" options={{ animation: PUSH }} />
          <Stack.Screen name="admin/training" options={{ animation: PUSH }} />
          <Stack.Screen name="credits" options={{ animation: PUSH }} />
          <Stack.Screen name="vehicle" options={{ animation: PUSH }} />
          <Stack.Screen name="my-stores" options={{ animation: PUSH }} />
          <Stack.Screen name="working-days" options={{ animation: PUSH }} />
          <Stack.Screen name="budget-settings" options={{ animation: PUSH }} />
          <Stack.Screen name="go-anywhere" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="navigate" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="motivation" options={{ animation: PUSH }} />
          <Stack.Screen name="personalise" options={{ animation: PUSH }} />
        </Stack.Protected>
      </Stack>
      {/* The one-hour clock-out alarm rings over any screen. */}
      {signedIn && onboarded && <VisitAlarm />}
      {/* Once per release, after installing or updating. */}
      {signedIn && onboarded && <WhatsNew />}
    </Animated.View>
  );
}

/** Same crest, size and position as the native splash image, so the handoff is seamless. */
function LogoSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: '#060606', alignItems: 'center', justifyContent: 'center' }}>
      <BRLogo size={SPLASH_LOGO_WIDTH} animated />
    </View>
  );
}

// app.json splash: imageWidth 200 with the crest filling 92% of a square canvas.
const SPLASH_LOGO_WIDTH = 200 * 0.92 * (200 / 220);

function SetupNeeded() {
  return (
    <Screen standalone title="Almost ready" kicker="Setup">
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
    <Screen standalone title="Can't reach BOAROUTE" kicker="Connection">
      <Txt variant="body" tone="dim" style={{ marginBottom: 20 }}>
        Your account is signed in but your profile could not be loaded. Check your signal and try again.
      </Txt>
      <View style={{ gap: 12 }}>
        <NeonButton label="Try again" icon="refresh" onPress={() => refreshProfile().catch(() => {})} full />
        <NeonButton label="Sign out" variant="ghost" onPress={() => signOut().catch((e) => Alert.alert('Could not sign out', e instanceof Error && e.message ? e.message : 'Check your connection and try again.'))} full />
      </View>
    </Screen>
  );
}
