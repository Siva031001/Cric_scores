import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Share, Alert, Linking } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

export default function ShareMatchSheet({ visible, onClose, match, matchId }: any) {
  const buildMessage = () =>
    `🏏 ${match.team1} vs ${match.team2}\nMatch ID: ${matchId}\nWatch live: Open CricketScorer app → Live Match → Enter ID: ${matchId}`;

  const shareVia = async (platform: string) => {
    const msg = buildMessage();
    try {
      if (platform === 'whatsapp') {
        const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
        const supported = await Linking.canOpenURL(url);
        if (supported) await Linking.openURL(url);
        else Alert.alert('WhatsApp not installed');
      } else if (platform === 'telegram') {
        const url = `tg://msg?text=${encodeURIComponent(msg)}`;
        const supported = await Linking.canOpenURL(url);
        if (supported) await Linking.openURL(url);
        else Alert.alert('Telegram not installed');
      } else {
        await Share.share({ message: msg });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not share');
    }
    onClose();
  };

  const OPTIONS = [
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { key: 'telegram', label: 'Telegram', icon: '✈️' },
    { key: 'generic', label: 'More Apps', icon: '📤' },
    { key: 'copy', label: 'Copy Link', icon: '🔗' },
    { key: 'qr', label: 'QR Code', icon: '📱' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>Share Live Match</Text>
          <View style={s.grid}>
            {OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.key}
                style={s.item}
                onPress={() => {
                  if (o.key === 'copy') { Alert.alert('Match ID', matchId); onClose(); return; }
                  if (o.key === 'qr') { Alert.alert('QR Code', 'QR code sharing coming soon — for now, share the Match ID directly.'); onClose(); return; }
                  shareVia(o.key === 'generic' ? 'generic' : o.key);
                }}
              >
                <Text style={s.itemIcon}>{o.icon}</Text>
                <Text style={s.itemLabel}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  title: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', marginBottom: 12 },
  item: { alignItems: 'center', width: '30%', marginBottom: 16 },
  itemIcon: { fontSize: 28, marginBottom: 6 },
  itemLabel: { color: COLORS.textSecondary, fontSize: 11, textAlign: 'center' },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelTxt: { color: COLORS.textMuted },
});