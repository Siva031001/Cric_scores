import 'react-native-gesture-handler';
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { enableFreeze } from 'react-native-screens';
enableFreeze(false);
import AppIcon from "./src/components/AppIcon";
import LoginScreen from "./src/screens/auth/LoginScreen";
import ForgotPasswordScreen from "./src/screens/auth/ForgotPasswordScreen";
import HomeScreen from "./src/screens/home/HomeScreen";
import CreateTeamScreen from "./src/screens/teams/CreateTeamScreen";
import MyTeamsScreen from "./src/screens/teams/MyTeamsScreen";
import TeamDetailScreen from "./src/screens/teams/TeamDetailScreen";
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
import CommentaryScreen from "./src/screens/match/CommentaryScreen";
import ProfileScreen from "./src/screens/settings/ProfileScreen";
import ProfileEditScreen from "./src/screens/settings/ProfileEditScreen";
import SettingsScreen from "./src/screens/settings/SettingsScreen";
import MyTournamentScreen from "./src/screens/tournament/MyTournamentScreen";
import TournamentDetailScreen from "./src/screens/tournament/TournamentDetailScreen";
import CreateTournamentScreen from "./src/screens/tournament/CreateTournamentScreen";
import TournamentLeaderboardScreen from "./src/screens/tournament/LeaderboardScreen";
import MyMatchesScreen from "./src/screens/stats/MyMatchesScreen";
import MatchHistoryDetailScreen from "./src/screens/stats/MatchHistoryDetailScreen";
import { createNavigationContainerRef } from "@react-navigation/native";
import { Alert } from "react-native";
import { subscribeToSessionValidity, logoutLocalSession } from "./src/utils/pinAuthService";
import JoinAsCaptainScreen from "./src/screens/tournament/JoinAsCaptainScreen";
import StreamingDashboardScreen from "./src/screens/match/StreamingDashboardScreen";
import ThemeSelectorScreen from "./src/screens/match/ThemeSelectorScreen";



// NOTE: The old src/screens/LeaderboardScreen.tsx has been intentionally removed.
// It imported from a non-existent '../utils/leaderboard' utility and was dead code
// (nothing in the app navigated to 'Leaderboard'). Tournament points table is now
// handled by TournamentLeaderboardScreen (src/screens/tournament/LeaderboardScreen.tsx).

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
    <View style={{ flex: 1, backgroundColor: '#0a1628', justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={{ alignItems: 'center', opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
        <AppIcon emoji="0" size={80} color="#fff" style={{ marginBottom: 16 }} />
        <Text style={{ color: '#ffffff', fontSize: 36, fontWeight: 'bold' }}>CricketScorer</Text>
        <Text style={{ color: '#4ade80', fontSize: 16, marginTop: 8 }}>Your cricket companion</Text>
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 60, color: '#6b7280', fontSize: 14 }}>Loading...</Text>
    </View>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

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
      setUser(remoteSessionId === localSessionId ? { valid: true } : null);
    } else {
      setUser(null);
    }
    setLoading(false);
  }, 2000);
  return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
  const unsub = subscribeToSessionValidity(async () => {
    await logoutLocalSession();
    Alert.alert(
      "Logged Out",
      "This account was signed in on another device, so you've been logged out here."
    );
    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: "Login" }] });
    }
  });
  return unsub;
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
        <Stack.Screen name="PublicMatch"      component={PublicMatchScreen} />
        <Stack.Screen name="Commentary"       component={CommentaryScreen} />

        {/* -- Stats -- */}
        <Stack.Screen name="MyMatches"        component={MyMatchesScreen} />
        <Stack.Screen name="MatchHistoryDetail" component={MatchHistoryDetailScreen} />

        {/* -- Teams -- */}
        <Stack.Screen name="CreateTeam"       component={CreateTeamScreen} />
        <Stack.Screen name="MyTeams"          component={MyTeamsScreen} />
        <Stack.Screen name="TeamDetail"       component={TeamDetailScreen} />

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
      </Stack.Navigator>
    </NavigationContainer>
  );
}


