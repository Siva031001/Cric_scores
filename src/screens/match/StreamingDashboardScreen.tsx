import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ScrollView, Share } from 'react-native';
import { subscribeToMatch, updateMatch } from '../../utils/firebase';
import { validateStreamSource } from '../../utils/liveStreamValidation';
import { getOversString } from '../../utils/cricketLogic';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

export default function StreamingDashboardScreen({ route, navigation }: any) {
  const { matchId } = route.params ?? {};
  const [match, setMatch] = useState<any>(null);
  const [streamInput, setStreamInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    if (!matchId) return;
    const unsub = subscribeToMatch(matchId, setMatch);
    return unsub;
  }, [matchId]);

  useEffect(() => {
    if (!match?.isStreaming || !match?.streamStartedAt) return;
    const t = setInterval(() => {
      setDurationSec(Math.floor((Date.now() - match.streamStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [match?.isStreaming, match?.streamStartedAt]);

  if (!match) {
    return <View style={s.center}><Text style={s.loadingTxt}>Loading match…</Text></View>;
  }

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ssec = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(ssec).padStart(2, '0')}`
      : `${m}:${String(ssec).padStart(2, '0')}`;
  };

  const handleConnectStream = async () => {
    const result = validateStreamSource(streamInput);
    if (!result.valid) {
      Alert.alert('Invalid Stream Source', result.error);
      return;
    }
    setConnecting(true);
    try {
      await updateMatch(matchId, {
        streamUrl: streamInput.trim(),
        streamSourceType: result.type,
        isStreaming: false, // connected but not yet started
      });
      Alert.alert('Connected', 'Stream source connected successfully. Tap Start Live when ready.');
      setStreamInput('');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not connect stream');
    } finally {
      setConnecting(false);
    }
  };

  const handleStartLive = async () => {
    if (!match.streamUrl) {
      Alert.alert('No Stream Connected', 'Connect a YouTube URL or stream key first.');
      return;
    }
    await updateMatch(matchId, { isStreaming: true, isLive: true, status: 'live', streamStartedAt: Date.now(), streamPaused: false });
  };

  const handlePauseLive = async () => {
    await updateMatch(matchId, { streamPaused: true });
  };

  const handleResumeLive = async () => {
    await updateMatch(matchId, { streamPaused: false });
  };

  const handleEndLive = async () => {
    Alert.alert('End Live Stream', 'Stop streaming? The match scoring will continue, but the live video feed will end.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Live',
        style: 'destructive',
        onPress: async () => {
          await updateMatch(matchId, { isStreaming: false, streamPaused: false });
        },
      },
    ]);
  };

  const handleShareLink = async () => {
    const msg = `Watch LIVE: ${match.team1} vs ${match.team2}\nMatch ID: ${matchId}\nOpen CricketScorer app → Live Match → Enter ID: ${matchId}`;
    await Share.share({ message: msg });
  };

  const handleCopyLink = () => {
    // Clipboard requires @react-native-clipboard/clipboard — falling back to Share for now
    // since that package isn't confirmed installed in this project yet.
    Alert.alert('Match ID', matchId, [{ text: 'OK' }]);
  };

  const streamStatus = match.isStreaming ? (match.streamPaused ? 'PAUSED' : 'LIVE') : 'OFFLINE';

  return (
    <View style={s.container}>
      <Header title="Streaming Dashboard" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll}>

        {/* Match Information */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Match Information</Text>
          {match.tournamentId && <Text style={s.infoRow}>Tournament match</Text>}
          <Text style={s.infoRow}>{match.team1} vs {match.team2}</Text>
          {match.venue ? <Text style={s.infoRow}>Venue: {match.venue}</Text> : null}
          <Text style={s.infoRow}>Overs: {match.totalOvers}</Text>
          <Text style={s.infoRow}>Status: {match.status}</Text>
        </View>

        {/* Streaming Status */}
        <View style={s.card}>
          <View style={s.statusRow}>
            <View style={[s.statusBadge, streamStatus === 'LIVE' && s.statusLive, streamStatus === 'PAUSED' && s.statusPaused]}>
              <Text style={s.statusBadgeTxt}>{streamStatus}</Text>
            </View>
            {match.isStreaming && <Text style={s.durationTxt}>{formatDuration(durationSec)}</Text>}
          </View>
          <View style={s.metricsRow}>
            <View style={s.metric}>
              <Text style={s.metricLabel}>Viewers</Text>
              <Text style={s.metricValue}>—</Text>
            </View>
            <View style={s.metric}>
              <Text style={s.metricLabel}>Connection</Text>
              <Text style={[s.metricValue, { color: COLORS.primary }]}>Good</Text>
            </View>
          </View>
          <Text style={s.metricNote}>Viewer count and stream health require YouTube Data API integration — shown as placeholders until that's connected.</Text>
        </View>

        {/* YouTube Connection */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Stream Source</Text>
          {match.streamUrl ? (
            <View>
              <Text style={s.connectedLabel}>✓ Connected</Text>
              <Text style={s.connectedUrl} numberOfLines={1}>{match.streamUrl}</Text>
            </View>
          ) : (
            <>
              <TextInput
                style={s.input}
                placeholder="YouTube URL or RTMP stream key"
                placeholderTextColor={COLORS.textMuted}
                value={streamInput}
                onChangeText={setStreamInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={[s.btn, connecting && { opacity: 0.6 }]} onPress={handleConnectStream} disabled={connecting}>
                <Text style={s.btnTxt}>{connecting ? 'Connecting…' : 'Connect Stream'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {match.streamUrl && (
  <TouchableOpacity
    style={[s.btn, { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 }]}
    onPress={() => navigation.navigate('ThemeSelector', { matchId, match, currentThemeId: match.streamThemeId ?? 'classic' })}
  >
    <Text style={[s.btnTxt, { color: COLORS.text }]}>🎨 Change Overlay Theme</Text>
  </TouchableOpacity>
)}

        {/* Streaming Controls */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Streaming Controls</Text>
          <View style={s.controlsGrid}>
            {!match.isStreaming && (
              <TouchableOpacity style={[s.controlBtn, s.controlBtnPrimary]} onPress={handleStartLive}>
                <Text style={s.controlBtnTxt}>▶ Start Live</Text>
              </TouchableOpacity>
            )}
            {match.isStreaming && !match.streamPaused && (
              <TouchableOpacity style={[s.controlBtn, { backgroundColor: COLORS.orange }]} onPress={handlePauseLive}>
                <Text style={s.controlBtnTxt}>⏸ Pause Live</Text>
              </TouchableOpacity>
            )}
            {match.isStreaming && match.streamPaused && (
              <TouchableOpacity style={[s.controlBtn, s.controlBtnPrimary]} onPress={handleResumeLive}>
                <Text style={s.controlBtnTxt}>▶ Resume</Text>
              </TouchableOpacity>
            )}
            {match.isStreaming && (
              <TouchableOpacity style={[s.controlBtn, { backgroundColor: COLORS.red }]} onPress={handleEndLive}>
                <Text style={s.controlBtnTxt}>⏹ End Live</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.controlBtn, s.controlBtnOutline]} onPress={handleShareLink}>
              <Text style={s.controlBtnOutlineTxt}>Share Live Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.controlBtn, s.controlBtnOutline]} onPress={handleCopyLink}>
              <Text style={s.controlBtnOutlineTxt}>Copy Match Link</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={s.scoringLink} onPress={() => navigation.navigate('Scoring', { matchId })}>
          <Text style={s.scoringLinkTxt}>Go to Scoring Screen →</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingTxt: { color: COLORS.textSecondary },
  scroll: { flex: 1, padding: SPACING.lg },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 10, letterSpacing: 0.5 },
  infoRow: { color: COLORS.text, fontSize: 13, marginBottom: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { backgroundColor: COLORS.card2, paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.round },
  statusLive: { backgroundColor: COLORS.red },
  statusPaused: { backgroundColor: COLORS.orange },
  statusBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  durationTxt: { color: COLORS.textSecondary, fontSize: 13, fontWeight: 'bold' },
  metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metric: { flex: 1, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 12, alignItems: 'center' },
  metricLabel: { color: COLORS.textMuted, fontSize: 10, marginBottom: 4 },
  metricValue: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  metricNote: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  connectedLabel: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  connectedUrl: { color: COLORS.textSecondary, fontSize: 12 },
  input: { backgroundColor: COLORS.background, color: COLORS.text, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, fontSize: 13 },
  btn: { backgroundColor: COLORS.primary, padding: 13, borderRadius: RADIUS.md, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: 'bold' },
  controlsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  controlBtn: { flexBasis: '48%', flexGrow: 1, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: COLORS.card2 },
  controlBtnPrimary: { backgroundColor: COLORS.primary },
  controlBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  controlBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  controlBtnOutlineTxt: { color: COLORS.text, fontWeight: 'bold', fontSize: 13 },
  scoringLink: { alignItems: 'center', padding: 12 },
  scoringLinkTxt: { color: COLORS.primary, fontWeight: 'bold' },
});