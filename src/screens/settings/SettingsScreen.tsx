import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import { deleteAccount } from '../../utils/firebase';
import auth from '@react-native-firebase/auth';
import AppIcon from '../../components/AppIcon';

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
        {items.map((item: any, i) => {
          // Ordinary rows cycle through a small set of vivid tints so the
          // menu reads as colourful rather than a flat list — purely a
          // decorative colour choice, danger/warning rows keep their own
          // semantic colour exactly as before and always take priority.
          const tint = item.danger ? COLORS.error : item.warning ? COLORS.warning : ICON_TINTS[i % ICON_TINTS.length];
          return (
            <TouchableOpacity key={i} style={[styles.item, item.danger && styles.dangerItem, item.warning && styles.warningItem]} onPress={item.onPress}>
            <View pointerEvents="none" style={styles.itemEdge} />
            <View style={[styles.itemIcon, { backgroundColor: tint + '1f' }]}>
            <AppIcon
              emoji={item.icon}
              size={20}
              color={tint}
            />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemLabel, item.danger && styles.dangerText, item.warning && styles.warningText]}>{item.label}</Text>
                {item.sublabel && <Text style={styles.itemSub}>{item.sublabel}</Text>}
            </View>
              <AppIcon emoji="›" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          );
        })}
        <Text style={styles.version}>Cricket Scorer v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

// Vivid, non-semantic accents for ordinary (non-danger/warning) row icons —
// cycled by row index. Kept clear of red/orange since those already carry
// the danger/warning meaning for the two rows below.
const ICON_TINTS = [COLORS.blue, COLORS.purple, COLORS.teal, COLORS.yellow];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, gap: SPACING.sm + 2 },
  // Rows are now proper elevated cards with a hairline top highlight, matching
  // the menu grid on the home screen — they used to be flat outlined boxes.
  item: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: RADIUS.xl,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderSoft,
    gap: 14, overflow: 'hidden', ...SHADOW.sm,
  },
  itemEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  // Destructive rows get a tinted border AND a tinted icon tile, so the two
  // dangerous actions are readable at a glance without shouting.
  dangerItem: { borderColor: COLORS.error + '55' },
  warningItem: { borderColor: COLORS.warning + '55' },
  itemIcon: {
    width: 44, height: 44, borderRadius: RADIUS.lg,
    justifyContent: 'center', alignItems: 'center',
  },
  itemInfo: { flex: 1 },
  itemLabel: { ...TYPE.title, fontSize: 15, color: COLORS.text },
  dangerText: { color: COLORS.error },
  warningText: { color: COLORS.warning },
  itemSub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 2 },
  arrow: { color: COLORS.textSecondary, fontSize: 20 },
  version: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.lg },
});