import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  title: string;
  onBack?: () => void;
  rightText?: string;
  onRight?: () => void;
  rightColor?: string;
}

export default function Header({ title, onBack, rightText, onRight, rightColor }: Props) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.side} onPress={onBack}>
        {onBack && <Text style={styles.back}>←</Text>}
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity style={[styles.side, styles.rightSide]} onPress={onRight}>
        {rightText && (
          <Text style={[styles.rightText, rightColor ? { color: rightColor } : {}]}>
            {rightText}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: COLORS.background,
  },
  side: { width: 70 },
  rightSide: { alignItems: 'flex-end' },
  back: { color: COLORS.primary, fontSize: 22 },
  title: { flex: 1, color: COLORS.text, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  rightText: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold' },
});