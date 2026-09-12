import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ScrollView, Share, Modal } from 'react-native';import { subscribeToMatch, updateMatch, isMatchOrganizer } from '../../utils/firebase';
import { validateStreamSource } from '../../utils/liveStreamValidation';
import { subscribeToNetworkHealth } from '../../utils/networkHealth';
import { getOversString } from '../../utils/cricketLogic';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import ShareMatchSheet from '../../components/ShareMatchSheet';


export default function StreamingDashboardScreen({ route, navigation }: any) {
  const { matchId } = route.params ?? {};
  const [match, setMatch] = useState<any>(null);
  const [streamInput, setStreamInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [netHealth, setNetHealth] = useState('Good');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);

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

  useEffect(() => {
    if (match) {
      setEditTitle(match.streamTitle ?? '');
      setEditDesc(match.streamDescription ?? '');
      setCommentsEnabled(match.commentsEnabled ?? true);
    }
  }, [match?.streamTitle, match?.streamDescription, match?.commentsEnabled]);

  useEffect(() => {
    const unsub = subscribeToNetworkHealth((status) => {
      setNetHealth(status);
      if (status === 'Poor' || status === 'Disconnected') {
        Alert.alert('Weak Connection', 'Your internet connection is unstable — streaming quality may drop.');
      }
    });
    return unsub;
  }, []);

  if (!match) {
    return <View style={s.center}><Text style={s.loadingTxt}>Loading match…</Text></View>;
  }
  
  const isOrganizer = isMatchOrganizer(match);
  

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
              <Text style={[s.metricValue, { color: netHealth === 'Poor' || netHealth === 'Disconnected' ? COLORS.red : COLORS.primary }]}>{netHealth}</Text>
            </View>
          </View>
          <Text style={s.metricNote}>Viewer count and stream health require YouTube Data API integration — shown as placeholders until that's connected.</Text>
        </View>

        {/* Viewer Statistics */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Viewer Statistics</Text>
          <Text style={s.metricNote}>Detailed viewer stats (peak viewers, average watch time, likes, comments, country/device breakdown) require YouTube Data API integration — a separate setup step (YouTube channel + API credentials). Placeholder shown until that's connected.</Text>
        </View>

        {/* Sponsor Banner (future monetization) */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Sponsor Banner</Text>
          <Text style={s.metricNote}>Coming soon — local sponsors will be able to display a banner on this tournament's live stream and scorecard.</Text>
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
                placeholder="YouTube URL or rtmp://your-stream-url"
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

        {/* Streaming Quality */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Streaming Quality</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { key: '360p', label: '360p', dataPerHour: '~150 MB/hr' },
              { key: '480p', label: '480p', dataPerHour: '~300 MB/hr' },
              { key: '720p', label: '720p', dataPerHour: '~800 MB/hr' },
              { key: '1080p', label: '1080p', dataPerHour: '~1.6 GB/hr' },
              { key: 'auto', label: 'Auto', dataPerHour: 'Adjusts automatically' },
            ].map((q) => (
              <TouchableOpacity
                key={q.key}
                style={[s.qualityChip, match.streamQuality === q.key && s.qualityChipActive]}
                onPress={() => updateMatch(matchId, { streamQuality: q.key })}
              >
                <Text style={[s.qualityChipTxt, match.streamQuality === q.key && { color: '#fff' }]}>{q.label}</Text>
                <Text style={s.qualityChipSub}>{q.dataPerHour}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Organizer: Edit Stream Details */}
        <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border }]} onPress={() => setShowEditModal(true)}>
          <Text style={[s.btnTxt, { color: COLORS.text }]}>✏️ Edit Stream Details</Text>
        </TouchableOpacity>

        {/* Streaming Controls */}
        {isOrganizer ? (
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
            <TouchableOpacity style={[s.controlBtn, s.controlBtnOutline]} onPress={() => setShowShareSheet(true)}>
              <Text style={s.controlBtnOutlineTxt}>Share Live Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.controlBtn, s.controlBtnOutline]} onPress={handleCopyLink}>
              <Text style={s.controlBtnOutlineTxt}>Copy Match Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.controlBtn, s.controlBtnOutline]} onPress={() => Alert.alert('Coming Soon', 'Automatic recording of highlights, full match, and short clips will be available in a future update.')}>
              <Text style={s.controlBtnOutlineTxt}>🎬 Recording (Coming Soon)</Text>
            </TouchableOpacity>
          </View>
        </View>
        ) : (
          <View style={s.card}>
            <Text style={s.metricNote}>Only the match organizer can control streaming. You have read-only access.</Text>
          </View>
        )}

        <TouchableOpacity style={s.scoringLink} onPress={() => navigation.navigate('Scoring', { matchId })}>
          <Text style={s.scoringLinkTxt}>Go to Scoring Screen →</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />

        <Modal visible={showEditModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.cardTitle}>Edit Stream</Text>
              <TextInput style={s.input} placeholder="Stream title" value={editTitle} onChangeText={setEditTitle} placeholderTextColor={COLORS.textMuted} />
              <TextInput style={[s.input, { height: 80 }]} placeholder="Description" value={editDesc} onChangeText={setEditDesc} multiline placeholderTextColor={COLORS.textMuted} />
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }} onPress={() => setCommentsEnabled(!commentsEnabled)}>
                <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: commentsEnabled ? COLORS.primary : 'transparent' }} />
                <Text style={{ color: COLORS.text }}>Enable Comments</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={async () => {
                await updateMatch(matchId, { streamTitle: editTitle, streamDescription: editDesc, commentsEnabled });
                setShowEditModal(false);
              }}>
                <Text style={s.btnTxt}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ padding: 12, alignItems: 'center' }} onPress={() => setShowEditModal(false)}>
                <Text style={{ color: COLORS.textMuted }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <ShareMatchSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)} match={match} matchId={matchId} />
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
  qualityChip: { backgroundColor: COLORS.card2, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, minWidth: 90, alignItems: 'center' },
  qualityChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  qualityChipTxt: { color: COLORS.text, fontWeight: 'bold', fontSize: 12 },
  qualityChipSub: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: SPACING.lg },
  modalBox: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.lg },
});
  
