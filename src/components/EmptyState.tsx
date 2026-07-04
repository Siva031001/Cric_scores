import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../constants/theme';

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  btnText?: string;
  onBtn?: () => void;
}

export default function EmptyState({ icon, title, subtitle, btnText, onBtn }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {btnText && onBtn && (
        <TouchableOpacity style={styles.btn} onPress={onBtn}>
          <Text style={styles.btnText}>{btnText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  btn: { backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: RADIUS.round },
  btnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});