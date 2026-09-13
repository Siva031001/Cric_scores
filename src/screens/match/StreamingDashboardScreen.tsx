import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ScrollView, Share, Modal } from 'react-native';import { subscribeToMatch, updateMatch, isMatchOrganizer } from '../../utils/firebase';
import { validateStreamSource } from '../../utils/liveStreamValidation';
import { subscribeToNetworkHealth } from '../../utils/networkHealth';
import { getOversString } from '../../utils/cricketLogic';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import ShareMatchSheet from '../../components/ShareMatchSheet';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import AppIcon from '../../components/AppIcon';


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
        <Card style={s.card}>
          <Text style={s.cardTitle}>Match Information</Text>
          {match.tournamentId && <Text style={s.infoRow}>Tournament match</Text>}
          <Text style={s.infoRow}>{match.team1} vs {match.team2}</Text>
          {match.venue ? <Text style={s.infoRow}>Venue: {match.venue}</Text> : null}
          <Text style={s.infoRow}>Overs: {match.totalOvers}</Text>
          <Text style={s.infoRow}>Status: {match.status}</Text>
        </Card>

        {/* Streaming Status */}
        <Card style={s.card}>
          <View style={s.statusRow}>
            <Badge
              label={streamStatus}
              tone={streamStatus === 'LIVE' ? 'live' : streamStatus === 'PAUSED' ? 'warning' : 'neutral'}
              style={s.statusBadge}
            />
            {match.isStreaming && <Text style={s.durationTxt}>{formatDuration(durationSec)}</Text>}
          </View>
          <View style={s.metricsRow}>
            <View style={s.metric}>
              <Text style={s.metricLabel}>Viewers</Text>
              <Text style={s.metricValue}>—</Text>
            </View>
            <View style={s.metric}>
              <Text style={s.metricLabel}>Connection</Text>
              <Text style={[s.metricValue, { color: netHealth === 'Poor' || netHealth === 'Disconnected' ? COLORS.error : COLORS.primaryLight }]}>{netHealth}</Text>
            </View>
          </View>
          <Text style={s.metricNote}>Viewer count and stream health require YouTube Data API integration — shown as placeholders until that's connected.</Text>
        </Card>

        {/* Viewer Statistics */}
        <Card style={s.card}>
          <Text style={s.cardTitle}>Viewer Statistics</Text>
          <Text style={s.metricNote}>Detailed viewer stats (peak viewers, average watch time, likes, comments, country/device breakdown) require YouTube Data API integration — a separate setup step (YouTube channel + API credentials). Placeholder shown until that's connected.</Text>
        </Card>

        {/* Sponsor Banner (future monetization) */}
        <Card style={s.card}>
          <Text style={s.cardTitle}>Sponsor Banner</Text>
          <Text style={s.metricNote}>Coming soon — local sponsors will be able to display a banner on this tournament's live stream and scorecard.</Text>
        </Card>

        {/* YouTube Connection */}
        <Card style={s.card}>
          <Text style={s.cardTitle}>Stream Source</Text>
          {match.streamUrl ? (
            <View>
              <View style={s.connectedRow}>
                <AppIcon emoji="✓" size={14} color={COLORS.primary} />
                <Text style={s.connectedLabel}>Connected</Text>
              </View>
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
        </Card>

        {match.streamUrl && (
  <TouchableOpacity
    style={[s.btn, s.btnSecondary, s.btnSpaced]}
    onPress={() => navigation.navigate('ThemeSelector', { matchId, match, currentThemeId: match.streamThemeId ?? 'classic' })}
  >
    <Text style={[s.btnTxt, s.btnSecondaryTxt]}>🎨 Change Overlay Theme</Text>
  </TouchableOpacity>
)}

        {/* Streaming Quality */}
        <Card style={s.card}>
          <Text style={s.cardTitle}>Streaming Quality</Text>
          <View style={s.qualityGrid}>
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
                <Text style={[s.qualityChipTxt, match.streamQuality === q.key && { color: COLORS.primaryLight }]}>{q.label}</Text>
                <Text style={s.qualityChipSub}>{q.dataPerHour}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Organizer: Edit Stream Details */}
        <TouchableOpacity style={[s.btn, s.btnSecondary, s.btnSpaced]} onPress={() => setShowEditModal(true)}>
          <Text style={[s.btnTxt, s.btnSecondaryTxt]}>✏️ Edit Stream Details</Text>
        </TouchableOpacity>

        {/* Streaming Controls */}
        {isOrganizer ? (
        <Card style={s.card}>
          <Text style={s.cardTitle}>Streaming Controls</Text>
          <View style={s.controlsGrid}>
            {!match.isStreaming && (
              <TouchableOpacity style={[s.controlBtn, s.controlBtnPrimary]} onPress={handleStartLive}>
                <Text style={s.controlBtnTxt}>▶ Start Live</Text>
              </TouchableOpacity>
            )}
            {match.isStreaming && !match.streamPaused && (
              <TouchableOpacity style={[s.controlBtn, s.controlBtnWarning]} onPress={handlePauseLive}>
                <Text style={s.controlBtnTxt}>⏸ Pause Live</Text>
              </TouchableOpacity>
            )}
            {match.isStreaming && match.streamPaused && (
              <TouchableOpacity style={[s.controlBtn, s.controlBtnPrimary]} onPress={handleResumeLive}>
                <Text style={s.controlBtnTxt}>▶ Resume</Text>
              </TouchableOpacity>
            )}
            {match.isStreaming && (
              <TouchableOpacity style={[s.controlBtn, s.controlBtnDanger]} onPress={handleEndLive}>
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
        </Card>
        ) : (
          <Card style={s.card}>
            <Text style={s.metricNote}>Only the match organizer can control streaming. You have read-only access.</Text>
          </Card>
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
              <TextInput style={[s.input, s.inputMultiline]} placeholder="Description" value={editDesc} onChangeText={setEditDesc} multiline placeholderTextColor={COLORS.textMuted} />
              <TouchableOpacity style={s.checkRow} onPress={() => setCommentsEnabled(!commentsEnabled)}>
                <View style={[s.checkbox, commentsEnabled && s.checkboxOn]} />
                <Text style={s.checkLabel}>Enable Comments</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btn} onPress={async () => {
                await updateMatch(matchId, { streamTitle: editTitle, streamDescription: editDesc, commentsEnabled });
                setShowEditModal(false);
              }}>
                <Text style={s.btnTxt}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowEditModal(false)}>
                <Text style={s.modalCancelTxt}>Cancel</Text>
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
  loadingTxt: { ...TYPE.body, color: COLORS.textSecondary },
  scroll: { flex: 1, padding: SPACING.lg },
  // Card is the shared elevated surface, so only spacing lives here now.
  card: { marginBottom: SPACING.sm + 2 },
  cardTitle: { ...TYPE.label, color: COLORS.primary, marginBottom: SPACING.sm },
  infoRow: { ...TYPE.body, color: COLORS.text, marginBottom: 3 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  // The pill itself comes from Badge; this only sizes it up, since on this
  // screen the on-air state is the most important thing in the card.
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6 },
  // A running stream timer: tabular figures stop it shifting every second.
  durationTxt: { ...TYPE.num, color: COLORS.text },
  metricsRow: { flexDirection: 'row', gap: SPACING.sm + 2, marginBottom: SPACING.sm },
  metric: {
    flex: 1, backgroundColor: COLORS.card2, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  metricLabel: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted, marginBottom: 5 },
  metricValue: { ...TYPE.h2, color: COLORS.text, fontVariant: ['tabular-nums'] },
  metricNote: { ...TYPE.caption, fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.xs },
  connectedLabel: { ...TYPE.label, color: COLORS.primary },
  connectedUrl: { ...TYPE.caption, color: COLORS.textSecondary },
  input: {
    backgroundColor: COLORS.card2, color: COLORS.text,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.sm, ...TYPE.body,
  },
  inputMultiline: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  btn: {
    backgroundColor: COLORS.primary, height: 46, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW.glow(COLORS.primary),
  },
  btnTxt: { ...TYPE.button, color: COLORS.onPrimary },
  // Secondary skin: a bordered raised surface with no glow, so it sits below
  // the primary action in the hierarchy instead of beside it.
  btnSecondary: { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border, shadowOpacity: 0, elevation: 0 },
  btnSecondaryTxt: { color: COLORS.text },
  btnSpaced: { marginBottom: SPACING.sm + 2 },
  controlsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  controlBtn: {
    flexBasis: '48%', flexGrow: 1, paddingVertical: 13,
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card2,
  },
  controlBtnPrimary: { backgroundColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  controlBtnWarning: { backgroundColor: COLORS.warning },
  // End Live is genuinely destructive, so this one is COLORS.error rather than
  // COLORS.live — live is reserved for the on-air state.
  controlBtnDanger: { backgroundColor: COLORS.error },
  controlBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  controlBtnTxt: { ...TYPE.bodyStrong, fontSize: 13, color: '#fff' },
  controlBtnOutlineTxt: { ...TYPE.bodyStrong, fontSize: 13, color: COLORS.text },
  scoringLink: { alignItems: 'center', paddingVertical: SPACING.md },
  scoringLinkTxt: { ...TYPE.button, color: COLORS.primary },
  qualityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  qualityChip: {
    backgroundColor: COLORS.card2, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    minWidth: 92, alignItems: 'center',
  },
  qualityChipActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  qualityChipTxt: { ...TYPE.num, fontSize: 13, color: COLORS.text },
  qualityChipSub: { ...TYPE.numSm, fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm + 2 },
  checkbox: { width: 20, height: 20, borderRadius: RADIUS.sm - 2, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: 'transparent' },
  checkboxOn: { backgroundColor: COLORS.primary },
  checkLabel: { ...TYPE.body, color: COLORS.text },
  modalOverlay: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'center', padding: SPACING.lg },
  // Sheets sit on the highest surface so they read as above the cards behind.
  modalBox: {
    backgroundColor: COLORS.surface3, borderRadius: RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.lg,
  },
  modalCancel: { paddingVertical: SPACING.md, alignItems: 'center' },
  modalCancelTxt: { ...TYPE.body, color: COLORS.textMuted },
});
