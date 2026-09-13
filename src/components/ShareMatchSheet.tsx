import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Share, Alert, Linking } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../constants/theme';

// Base URL for the OBS/broadcast overlay web app (web/ in this repo, a
// small Vite app deployed the same way admin/ already is). Replace once
// that app has an actual deployed domain — left as an obvious placeholder
// rather than a real, possibly-wrong URL.
const OVERLAY_BASE_URL = 'https://your-overlay-domain.example.com';
const overlayUrl = (matchId: string) => `${OVERLAY_BASE_URL}/?m=${encodeURIComponent(matchId)}`;

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
    { key: 'obsLink', label: 'OBS Overlay Link', icon: '🎥' },
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
                  if (o.key === 'obsLink') {
                    Alert.alert(
                      'OBS Overlay Link',
                      `${overlayUrl(matchId)}\n\nPaste this into OBS as a Browser Source (with a transparent background) to show live score graphics over your camera feed.`
                    );
                    onClose();
                    return;
                  }
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
  overlay: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface3,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, borderTopWidth: 1, borderColor: COLORS.border,
    ...SHADOW.lg,
  },
  title: { ...TYPE.h2, color: COLORS.text, textAlign: 'center', marginBottom: SPACING.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', marginBottom: 12 },
  // Each option is a tile rather than a loose icon+label pair, so the tap
  // target is visible.
  item: {
    alignItems: 'center', width: '30%', marginBottom: 14,
    paddingVertical: 14, borderRadius: RADIUS.md,
    backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  itemIcon: { fontSize: 26, marginBottom: 6 },
  itemLabel: { ...TYPE.caption, fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelTxt: { ...TYPE.button, fontSize: 14, color: COLORS.textSecondary },
});
