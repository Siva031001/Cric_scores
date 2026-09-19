import 'react-native-gesture-handler';
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { enableFreeze } from 'react-native-screens';
enableFreeze(false);
import AppIcon from "./src/components/AppIcon";
import { COLORS } from "./src/constants/theme";
import LoginScreen from "./src/screens/auth/LoginScreen";
import ForgotPasswordScreen from "./src/screens/auth/ForgotPasswordScreen";
import HomeScreen from "./src/screens/home/HomeScreen";
import CreateTeamScreen from "./src/screens/teams/CreateTeamScreen";
import MyTeamsScreen from "./src/screens/teams/MyTeamsScreen";
import TeamDetailScreen from "./src/screens/teams/TeamDetailScreen";
import TeamPlayersScreen from "./src/screens/teams/TeamPlayersScreen";
import ScoringScreen from "./src/screens/match/ScoringScreen";
import ScorecardScreen from "./src/screens/match/ScorecardScreen";
import NewMatchScreen from "./src/screens/match/NewMatchScreen";
import PlayerSetupScreen from "./src/screens/match/PlayerSetupScreen";
import BattingSetupScreen from "./src/screens/match/BattingSetupScreen";
import HistoryScreen from "./src/screens/match/HistoryScreen";
import LiveViewScreen from "./src/screens/match/LiveViewScreen";
import LiveStreamScreen from "./src/screens/match/LiveStreamScreen";
import MyLiveStreamsScreen from "./src/screens/match/MyLiveStreamsScreen";
import StreamingPlansScreen from "./src/screens/match/StreamingPlansScreen";
import PublicMatchScreen from "./src/screens/match/PublicMatchScreen";
import ProfileScreen from "./src/screens/settings/ProfileScreen";
import ProfileEditScreen from "./src/screens/settings/ProfileEditScreen";
import SettingsScreen from "./src/screens/settings/SettingsScreen";
import MyTournamentScreen from "./src/screens/tournament/MyTournamentScreen";
import TournamentDetailScreen from "./src/screens/tournament/TournamentDetailScreen";
import CreateTournamentScreen from "./src/screens/tournament/CreateTournamentScreen";
import TournamentLeaderboardScreen from "./src/screens/tournament/LeaderboardScreen";
import MyMatchesScreen from "./src/screens/stats/MyMatchesScreen";
import MatchHistoryDetailScreen from "./src/screens/stats/MatchHistoryDetailScreen";
import PlayerStatsScreen from "./src/screens/stats/PlayerStatsScreen";
import { createNavigationContainerRef } from "@react-navigation/native";
import { Alert } from "react-native";
import { subscribeToSessionValidity, logoutLocalSession } from "./src/utils/pinAuthService";
import JoinAsCaptainScreen from "./src/screens/tournament/JoinAsCaptainScreen";
import StreamingDashboardScreen from "./src/screens/match/StreamingDashboardScreen";
import ThemeSelectorScreen from "./src/screens/match/ThemeSelectorScreen";
import CameraModeScreen from "./src/screens/match/CameraModeScreen";
import TournamentInvitePreviewScreen from "./src/screens/tournament/TournamentInvitePreviewScreen";




// NOTE: src/screens/LeaderboardScreen.tsx still exists and imports a real
// '../utils/leaderboard' utility, but it is not registered as a route here and
// nothing else in the app imports or navigates to it, so it is currently unused.
// Tournament points table is handled by TournamentLeaderboardScreen
// (src/screens/tournament/LeaderboardScreen.tsx).

const navigationRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();

function SplashScreen() {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
    ]).start();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      {/* Two soft colour blobs behind the mark — same layered-blob technique
          used on the tournament banner cards, just plain tinted Views, so
          the splash reads as branded rather than a bare logo on black. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: COLORS.primary, opacity: 0.16, top: '28%' }} />
      <View pointerEvents="none" style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: COLORS.live, opacity: 0.12, top: '42%', left: '58%' }} />
      <Animated.View style={{ alignItems: 'center', opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primarySoft, borderWidth: 2, borderColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
          <AppIcon emoji="🏏" size={56} color={COLORS.primary} />
        </View>
        <Text style={{ color: COLORS.text, fontSize: 36, fontWeight: 'bold' }}>CricketScorer</Text>
        <Text style={{ color: COLORS.primaryLight, fontSize: 16, marginTop: 8 }}>Your cricket companion</Text>
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 60, color: COLORS.textMuted, fontSize: 14 }}>Loading...</Text>
    </View>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [resumeMatchId, setResumeMatchId] = useState<string | null>(null);

  useEffect(() => {
  const timer = setTimeout(async () => {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const localSessionId = await AsyncStorage.getItem("cricketscorer_session_id");
    const localPhone = await AsyncStorage.getItem("cricketscorer_phone");

    if (localSessionId && localPhone) {
      // Verify this device's session is STILL the active one for this phone
      const database = require("@react-native-firebase/database").default;
      const snap = await database().ref(`pinAuth/${localPhone}/activeSessionId`).once("value");
      const remoteSessionId = snap.val();
      const isValid = remoteSessionId === localSessionId;
      setUser(isValid ? { valid: true } : null);

      // A scorer who was mid-match when the app was killed/relaunched
      // should land straight back on that match instead of Home — the
      // scoring data itself always survives (persisted per-ball), but
      // having to hunt for "Continue" after a cold start reads as if the
      // match were lost. Only resumes if the match is still actually live.
      if (isValid) {
        const lastMatchId = await AsyncStorage.getItem("cricketscorer_last_scoring_match");
        if (lastMatchId) {
          const matchSnap = await database().ref(`matches/${lastMatchId}`).once("value");
          const m = matchSnap.val();
          if (m && (m.status === "live" || m.status === "paused")) {
            setResumeMatchId(lastMatchId);
          } else {
            await AsyncStorage.removeItem("cricketscorer_last_scoring_match");
          }
        }
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, 2000);
  return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!resumeMatchId || loading) return;
    const tryNavigate = () => {
      if (navigationRef.isReady()) {
        navigationRef.navigate("Scoring" as never, { matchId: resumeMatchId } as never);
      } else {
        setTimeout(tryNavigate, 100);
      }
    };
    tryNavigate();
  }, [resumeMatchId, loading]);

  useEffect(() => {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  let unsub: (() => void) | null = null;
  let pollTimer: any = null;
  let cancelled = false;

  const attach = () => {
    unsub = subscribeToSessionValidity(async () => {
      await logoutLocalSession();
      Alert.alert(
        "Logged Out",
        "This account was signed in on another device, so you've been logged out here."
      );
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    });
  };

  // subscribeToSessionValidity reads the stored phone once; if it isn't
  // there yet (fresh install, or before this run's first login), it
  // attaches no listener. Keep checking until a phone shows up (e.g. a
  // login completes later in this app session), then attach for real.
  const waitForPhoneThenAttach = async () => {
    const phone = await AsyncStorage.getItem("cricketscorer_phone");
    if (cancelled) return;
    if (phone) {
      attach();
    } else {
      pollTimer = setTimeout(waitForPhoneThenAttach, 3000);
    }
  };
  waitForPhoneThenAttach();

  return () => {
    cancelled = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (unsub) unsub();
  };
  }, []);

  if (loading) return <SplashScreen />;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={user ? "Home" : "Login"}>
        {/* -- Auth -- */}
        <Stack.Screen name="Login"            component={LoginScreen} />
        <Stack.Screen name="ForgotPassword"   component={ForgotPasswordScreen} />

        {/* -- Home -- */}
        <Stack.Screen name="Home"             component={HomeScreen} />

        {/* -- Match flow -- */}
        <Stack.Screen name="NewMatch"         component={NewMatchScreen} />
        <Stack.Screen name="PlayerSetup"      component={PlayerSetupScreen} />
        <Stack.Screen name="BattingSetup"     component={BattingSetupScreen} />
        <Stack.Screen name="Scoring"          component={ScoringScreen} />
        <Stack.Screen name="Scorecard"        component={ScorecardScreen} />
        <Stack.Screen name="History"          component={HistoryScreen} />
        <Stack.Screen name="LiveView"         component={LiveViewScreen} />
        <Stack.Screen name="LiveStream"       component={LiveStreamScreen} />
        <Stack.Screen name="MyLiveStreams"    component={MyLiveStreamsScreen} />
        <Stack.Screen name="StreamingPlans"   component={StreamingPlansScreen} />
        <Stack.Screen name="StreamingDashboard" component={StreamingDashboardScreen} />
        <Stack.Screen name="ThemeSelector" component={ThemeSelectorScreen} />
        <Stack.Screen name="CameraMode"    component={CameraModeScreen} />
        <Stack.Screen name="PublicMatch"      component={PublicMatchScreen} />
      

        {/* -- Stats -- */}
        <Stack.Screen name="MyMatches"        component={MyMatchesScreen} />
        <Stack.Screen name="MatchHistoryDetail" component={MatchHistoryDetailScreen} />

        {/* -- Teams -- */}
        <Stack.Screen name="CreateTeam"       component={CreateTeamScreen} />
        <Stack.Screen name="MyTeams"          component={MyTeamsScreen} />
        <Stack.Screen name="TeamDetail"       component={TeamDetailScreen} />
        <Stack.Screen name="TeamPlayers"      component={TeamPlayersScreen} />
        <Stack.Screen name="PlayerStats"      component={PlayerStatsScreen} />

        {/* -- Settings / Profile -- */}
        <Stack.Screen name="Profile"          component={ProfileScreen} />
        <Stack.Screen name="ProfileEdit"      component={ProfileEditScreen} />
        <Stack.Screen name="Settings"         component={SettingsScreen} />

        {/* -- Tournament -- */}
        <Stack.Screen name="MyTournament"     component={MyTournamentScreen} />
        <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
        <Stack.Screen name="CreateTournament" component={CreateTournamentScreen} />
        <Stack.Screen name="TournamentLeaderboard" component={TournamentLeaderboardScreen} />
        <Stack.Screen name="JoinAsCaptain" component={JoinAsCaptainScreen} />
        <Stack.Screen name="TournamentInvitePreview" component={TournamentInvitePreviewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


