import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import { deleteAccount } from '../../utils/firebase';
import auth from '@react-native-firebase/auth';

export default function SettingsScreen({ navigation }: any) {
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          try {
            // IMPORTANT: do NOT call auth().signOut() here. This app's Firebase Auth
            // session is anonymous, and signing out would mint a brand-new uid on the
            // next login -- permanently orphaning this device's teams/matches/stats,
            // which live in the database under the OLD uid. Logout should only clear
            // this device's local PIN-session pointer so the person has to re-enter
            // their PIN, while the underlying Firebase session (and its data) stays put.
            const { logoutLocalSession } = require('../../utils/pinAuthService');
            await logoutLocalSession();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (e: any) { Alert.alert('Error', e?.message ?? 'Logout failed'); }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete Account', 'This will permanently delete your account and all data. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (e: any) { Alert.alert('Error', e?.message); }
        },
      },
    ]);
  };

  const items = [
    { icon: '👤', label: 'Edit Profile', sublabel: 'Name, photo, playing role', onPress: () => navigation.navigate('ProfileEdit') },
    { icon: '👥', label: 'My Teams', sublabel: 'Manage your teams', onPress: () => navigation.navigate('MyTeams') },
    { icon: '📊', label: 'My Matches', sublabel: 'Match history & stats', onPress: () => navigation.navigate('MyMatches') },
    { icon: '🔔', label: 'Notifications', sublabel: 'Coming soon', onPress: () => Alert.alert('Coming Soon', 'Notifications will be available soon!') },
    { icon: '🚪', label: 'Logout', sublabel: 'Sign out of your account', onPress: handleLogout, warning: true },
    { icon: '🗑️', label: 'Delete Account', sublabel: 'Permanently delete all data', onPress: handleDeleteAccount, danger: true },
  ];

  return (
    <View style={styles.container}>
      <Header title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {items.map((item: any, i) => (
          <TouchableOpacity key={i} style={[styles.item, item.danger && styles.dangerItem, item.warning && styles.warningItem]} onPress={item.onPress}>
            <View style={styles.itemIcon}>
              <Text style={styles.itemIconText}>{item.icon}</Text>
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemLabel, item.danger && styles.dangerText, item.warning && styles.warningText]}>{item.label}</Text>
              {item.sublabel && <Text style={styles.itemSub}>{item.sublabel}</Text>}
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.version}>Cricket Scorer v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, gap: 12 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 14 },
  dangerItem: { borderColor: COLORS.red + '55' },
  warningItem: { borderColor: COLORS.orange + '55' },
  itemIcon: { width: 42, height: 42, borderRadius: RADIUS.sm, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center' },
  itemIconText: { fontSize: 20 },
  itemInfo: { flex: 1 },
  itemLabel: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  dangerText: { color: COLORS.red },
  warningText: { color: COLORS.orange },
  itemSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  arrow: { color: COLORS.textSecondary, fontSize: 20 },
  version: { color: COLORS.textMuted, textAlign: 'center', marginTop: 20, fontSize: 12 },
});