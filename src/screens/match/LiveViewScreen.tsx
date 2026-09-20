import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { subscribeToMatch } from '../../utils/firebase';
import { getOversString, getRunRate, getRequiredRunRate, statKey } from '../../utils/cricketLogic';
import { COLORS, RADIUS, SPACING, SHADOW, TYPE } from '../../constants/theme';
import Header from '../../components/Header';
import LiveScoreOverlay from '../../components/LiveScoreOverlay';
import Badge from '../../components/Badge';
import AppIcon from '../../components/AppIcon';
import { getCurrentPartnership, getWormData, getWinProbability } from '../../utils/matchAnalytics';
import WormGraph from '../../components/WormGraph';
import OverSummaryModal from '../../components/OverSummaryModal';
import UmpireEventPopup, { UmpireEventKind } from '../../components/UmpireEventPopup';
import { isLegacyWicket } from '../../engine/legacy';

const { width: SW } = Dimensions.get('window');

export default function LiveViewScreen({ navigation }: any) {
  const [matchId, setMatchId] = useState('');
  const [match, setMatch] = useState<any>(null);
  const [watching, setWatching] = useState(false);
  const [videoVisible, setVideoVisible] = useState(true);
  const [viewTab, setViewTab] = useState<'live'|'analytics'>('live');
  const [showOverSummary, setShowOverSummary] = useState(false);
  const [umpireEvent, setUmpireEvent] = useState<UmpireEventKind | null>(null);
  const lastBallCountRef = useRef<number>(-1);

  // Same "only fire on a genuinely new ball" guard as the Scorer's version —
  // -1 skips whatever's already in history on first load, and a ball count
  // that goes DOWN (an edit/undo on the scorer's side) just re-syncs quietly.
  useEffect(() => {
    if (!match) return;
    const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
    const balls = (inn?.ballHistory ?? []).filter((b: any) => b?.type !== 'NEW_BATSMAN');
    const count = balls.length;
    if (lastBallCountRef.current !== -1 && count > lastBallCountRef.current) {
      const result: string = balls[balls.length - 1]?.result ?? '';
      let kind: UmpireEventKind | null = null;
      if (isLegacyWicket(result)) kind = 'WICKET';
      else if (result === '4') kind = 'FOUR';
      else if (result === '6') kind = 'SIX';
      else if (result.startsWith('WD')) kind = 'WIDE';
      else if (result.startsWith('NB')) kind = 'NOBALL';
      if (kind) setUmpireEvent(kind);
    }
    lastBallCountRef.current = count;
  }, [match]);

  // Batsman (50/100/150) and bowler (3/4/5 wickets) milestones, written by
  // the Scorer's dispatch to match.lastMilestone / match.lastBowlingMilestone.
  // Tracks each by its timestamp so a milestone only pops once, and — since
  // it's declared after the ball-event effect above — takes priority over a
  // plain four/six/wicket pop-up landing in the same update.
  const lastMilestoneTsRef = useRef<number>(-1);
  const lastBowlingMilestoneTsRef = useRef<number>(-1);
  useEffect(() => {
    if (!match) return;
    const m = match.lastMilestone;
    const mTs = m?.ts ?? 0;
    if (lastMilestoneTsRef.current !== -1 && mTs > lastMilestoneTsRef.current) {
      const kind: UmpireEventKind = m.kind === 'HUNDRED_FIFTY' ? 'HUNDRED_FIFTY' : m.kind === 'HUNDRED' ? 'HUNDRED' : 'FIFTY';
      setUmpireEvent(kind);
    }
    lastMilestoneTsRef.current = mTs;

    const bm = match.lastBowlingMilestone;
    const bmTs = bm?.ts ?? 0;
    if (lastBowlingMilestoneTsRef.current !== -1 && bmTs > lastBowlingMilestoneTsRef.current) {
      const kind: UmpireEventKind = bm.kind === 'FIVE_WKTS' ? 'FIVE_WKTS' : bm.kind === 'FOUR_WKTS' ? 'FOUR_WKTS' : 'THREE_WKTS';
      setUmpireEvent(kind);
    }
    lastBowlingMilestoneTsRef.current = bmTs;
  }, [match]);

  const joinMatch = () => {
    const trimmed = matchId.trim();
    if (trimmed.length < 4 || !/^[A-Z0-9]+$/i.test(trimmed)) { Alert.alert('Error', 'Please enter a valid Match ID'); return; }
    setWatching(true);
  };

  useEffect(() => {
    if (!watching) return;
    const unsub = subscribeToMatch(matchId.toUpperCase(), (data: any) => {
      if (!data) { Alert.alert('Error', 'Match not found'); setWatching(false); return; }
      setMatch(data);
      if (data.status === 'completed') navigation.replace('Scorecard', { matchId: matchId.toUpperCase() });
    });
    return unsub;
  }, [watching]);

  const getYTEmbed = (url: string) => {
    const m = url?.match(/(?:v=|youtu\.be\/|\/live\/)([^&?/]+)/);
    return m ? 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&playsinline=1' : url;
  };

  if (!watching) {
    return (
      <View style={s.container}>
        <Header title="Join Live Match" onBack={() => navigation.goBack()} />
        <View style={s.joinBox}>
          {/* Soft colour blobs behind the join card — same plain-tinted-View
              technique used elsewhere in the app (no gradient library),
              purely decorative and clipped so it never intercepts touches. */}
          <View pointerEvents="none" style={s.joinBlobWrap}>
            <View style={[s.joinBlob, { backgroundColor: COLORS.primary, top: -40, left: -50 }]} />
            <View style={[s.joinBlob, { backgroundColor: COLORS.live, bottom: -60, right: -40 }]} />
          </View>
          <View style={s.joinBadge}><Text style={s.joinBadgeTxt}>LIVE</Text></View>
          <Text style={s.joinTitle}>Watch Live Match</Text>
          <Text style={s.joinSub}>Enter the Match ID shared by the scorer</Text>
          <TextInput style={s.joinInput} placeholder="Match ID  (e.g. AB1234)" placeholderTextColor={COLORS.textMuted}
            value={matchId} onChangeText={setMatchId} autoCapitalize="characters" maxLength={8} />
          <TouchableOpacity style={s.joinBtn} onPress={joinMatch}>
            <Text style={s.joinBtnTxt}>Join Match</Text>
          </TouchableOpacity>
          <Text style={s.joinHint}>Ask the scorer to tap Share ID on scoring screen</Text>
        </View>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.connectTxt}>Connecting to match...</Text>
      </View>
    );
  }

  const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
  const batP = match.currentInnings === 1 ? match.team1Players : match.team2Players;
  const bolP = match.currentInnings === 1 ? match.team2Players : match.team1Players;
  const tgt = match.currentInnings === 2 ? match.innings1.runs + 1 : null;
  // Stats are keyed `p<id>` (statKey) so Firebase stores the map as an object
  // instead of converting it to a sparse array. Indexing with the bare
  // numeric id returns undefined, which is why the striker, non-striker and
  // bowler figures used to show as zeros for spectators.
  const ss = inn?.batsmanStats?.[statKey(inn?.strikerId)];
  const ns = inn?.batsmanStats?.[statKey(inn?.nonStrikerId)];
  const bws = inn?.bowlerStats?.[statKey(inn?.currentBowlerId)];
  const hasStream = match.isStreaming && match.streamUrl;

  const getName = (players: any[], id: number) =>
    players?.find((p: any) => p.id === id)?.name ?? ('P' + (id + 1));

  return (
    <View style={s.container}>
      <UmpireEventPopup event={umpireEvent} onHide={() => setUmpireEvent(null)} />
      {/* Custom header with LIVE badge */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => { setWatching(false); setMatch(null); }}>
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          {/* Same LIVE indicator, now the shared Badge: it pulses its own dot
              on the native driver, so no state or timer lives in this screen. */}
          <Badge label="LIVE" tone="live" />
          <Text style={s.headerTeams} numberOfLines={1}>{match.team1} vs {match.team2}</Text>
        </View>
        <Text style={s.matchIdTxt}>#{matchId.toUpperCase()}</Text>
        {/* Two-tone accent line, matching the shared Header component's
            signature edge, since this screen renders its own custom header
            instead of <Header>. Purely decorative — non-interactive. */}
        <View pointerEvents="none" style={s.headerAccentLine}>
          <View style={[s.headerAccentHalf, { backgroundColor: COLORS.primary }]} />
          <View style={[s.headerAccentHalf, { backgroundColor: COLORS.live }]} />
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── VIDEO SECTION (CricHeroes style) ── */}
        {hasStream && (
          <View>
            <View style={s.videoBox}>
              {videoVisible ? (
                <WebView source={{ uri: getYTEmbed(match.streamUrl) }}
                  style={{ flex: 1 }} allowsFullscreenVideo javaScriptEnabled domStorageEnabled />
              ) : (
                <View style={s.videoPlaceholder}>
                  <Text style={s.videoPlaceholderTxt}>Video Paused</Text>
                </View>
              )}
              {/* Themed score overlay on top of video */}
              <View style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }} pointerEvents="none">
                <LiveScoreOverlay match={match} themeId={match.streamThemeId ?? 'classic'} />
              </View>
            </View>
            <TouchableOpacity style={s.videoToggle} onPress={() => setVideoVisible(!videoVisible)}>
              <Text style={s.videoToggleTxt}>{videoVisible ? 'Hide Video' : 'Show Video'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── SCORE CARD (always visible, CricHeroes style) ── */}
        <View style={s.scoreCard}>
          {/* Hairline highlight + soft corner tint — same cheap-depth trick used
              by the shared Card component, applied here since this screen
              hand-rolls its cards. Decorative only. */}
          <View pointerEvents="none" style={s.scoreCardEdge} />
          <View pointerEvents="none" style={s.scoreCardTint} />
          <View style={s.scoreCardTop}>
            <Text style={s.scoreCardTeam}>{match.currentInnings === 1 ? match.team1 : match.team2} batting</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.scoreCardInn}>Innings {match.currentInnings}</Text>
              <TouchableOpacity style={s.overSummaryBtn} onPress={() => setShowOverSummary(true)}>
                <Text style={s.overSummaryBtnTxt}>Overs ▾</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.scoreMainRow}>
            <Text style={s.scoreBig}>{inn?.runs ?? 0}/{inn?.wickets ?? 0}</Text>
            <View style={s.scoreMeta}>
              <Text style={s.scoreOvers}>{getOversString(inn?.overs ?? 0, inn?.balls ?? 0)}/{match.totalOvers} ov</Text>
              <Text style={s.scoreRR}>RR: {getRunRate(inn?.runs ?? 0, inn?.overs ?? 0, inn?.balls ?? 0)}</Text>
              {tgt && <Text style={s.scoreTgt}>Need {Math.max(0, tgt - (inn?.runs ?? 0))}</Text>}
              {tgt && <Text style={s.scoreRRR}>RRR: {getRequiredRunRate(tgt, inn?.runs ?? 0, match.totalOvers, inn?.overs ?? 0, inn?.balls ?? 0)}</Text>}
            </View>
          </View>

          {/* Last balls */}
          {(inn?.ballHistory?.length ?? 0) > 0 && (
            <View style={s.ballsRow}>
              <Text style={s.ballsLbl}>Last: </Text>
              {[...(inn.ballHistory ?? [])].slice(-8).map((b: any, i: number) => (
                <View key={i} style={[s.ball,
                  b.result === 'W' && s.bW,
                  b.result === '4' && s.b4,
                  b.result === '6' && s.b6,
                  (b.result?.startsWith?.('WD') || b.result?.startsWith?.('NB')) && s.bExtra]}>
                  <Text style={s.ballTxt}>{b.result?.length > 3 ? b.result.slice(0, 3) : b.result}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* AI Commentary — placed right under the score, not buried below the
            full scorecard, so it's visible without scrolling. */}
        <View style={s.commentaryCard}>
          <View pointerEvents="none" style={s.commentaryEdge} />
          <View style={s.analyticsTitleRow}>
            <AppIcon emoji="🤖" size={14} color={COLORS.primaryLight} />
            <Text style={s.analyticsTitle}>Commentary</Text>
          </View>
          {inn?.latestCommentaryText ? (
            <Text style={s.commentaryTxtBig}>{inn.latestCommentaryText}</Text>
          ) : (
            <Text style={s.commentaryEmpty}>Commentary will appear here once scoring begins.</Text>
          )}
        </View>

        {/* ── BATSMEN (CricHeroes style) ── */}
        <View style={s.playersCard}>
          <View pointerEvents="none" style={s.playersCardEdge} />
          <Text style={s.playersSectionLbl}>BATTING</Text>
          {/* Table header */}
          <View style={s.playerTableHeader}>
            <Text style={[s.phCell, s.phName]}>Batter</Text>
            <Text style={s.phCell}>R</Text>
            <Text style={s.phCell}>B</Text>
            <Text style={s.phCell}>4s</Text>
            <Text style={s.phCell}>6s</Text>
            <Text style={s.phCell}>SR</Text>
          </View>
          {/* Striker */}
          <View style={[s.playerRow, s.strikerRow]}>
            <View style={[s.pdCell, s.pdName]}>
              <Text style={s.strikerName}>* {getName(batP, inn?.strikerId)}</Text>
              <Text style={s.playerRoleLbl}>batting</Text>
            </View>
            <Text style={[s.pdCell, s.pdStat, s.pdStatStrong]}>{ss?.runs ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ss?.balls ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ss?.fours ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ss?.sixes ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ss?.balls > 0 ? ((ss.runs/ss.balls)*100).toFixed(0) : '0'}</Text>
          </View>
          {/* Non-striker */}
          <View style={s.playerRow}>
            <View style={[s.pdCell, s.pdName]}>
              <Text style={s.nonStrikerName}>{getName(batP, inn?.nonStrikerId)}</Text>
              <Text style={s.playerRoleLbl}>non-striker</Text>
            </View>
            <Text style={[s.pdCell, s.pdStat]}>{ns?.runs ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ns?.balls ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ns?.fours ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ns?.sixes ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{ns?.balls > 0 ? ((ns.runs/ns.balls)*100).toFixed(0) : '0'}</Text>
          </View>

          {/* Divider */}
          <View style={s.playerDivider} />

          {/* Bowler */}
          <Text style={s.playersSectionLbl}>BOWLING</Text>
          <View style={s.playerTableHeader}>
            <Text style={[s.phCell, s.phName]}>Bowler</Text>
            <Text style={s.phCell}>O</Text>
            <Text style={s.phCell}>R</Text>
            <Text style={s.phCell}>W</Text>
            <Text style={s.phCell}>Eco</Text>
          </View>
          <View style={s.playerRow}>
            <View style={[s.pdCell, s.pdName]}>
              <Text style={s.bowlerName}>{getName(bolP, inn?.currentBowlerId)}</Text>
              <Text style={s.playerRoleLbl}>bowling</Text>
            </View>
            <Text style={[s.pdCell, s.pdStat]}>{bws?.overs ?? 0}.{bws?.balls ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>{bws?.runs ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat, s.pdStatStrong, {color: (bws?.wickets ?? 0) > 0 ? COLORS.live : COLORS.text}]}>{bws?.wickets ?? 0}</Text>
            <Text style={[s.pdCell, s.pdStat]}>
              {bws && (bws.overs + bws.balls/6) > 0 ? (bws.runs / (bws.overs + bws.balls/6)).toFixed(1) : '0.0'}
            </Text>
          </View>
        </View>

        {/* ── EXTRAS ── */}
        <View style={s.extrasCard}>
          <Text style={s.extrasLbl}>Extras: {(inn?.extras?.wides ?? 0)+(inn?.extras?.noBalls ?? 0)+(inn?.extras?.byes ?? 0)+(inn?.extras?.legByes ?? 0)+(inn?.extras?.penalty ?? 0)}</Text>
          <Text style={s.extrasDtl}>W:{inn?.extras?.wides ?? 0}  NB:{inn?.extras?.noBalls ?? 0}  B:{inn?.extras?.byes ?? 0}  LB:{inn?.extras?.legByes ?? 0}  PTY:{inn?.extras?.penalty ?? 0}</Text>
        </View>

        {/* ── VIEW TABS: Live / Analytics ── */}
        <View style={s.viewTabs}>
          <TouchableOpacity style={[s.viewTab, viewTab === 'live' && s.viewTabActive]} onPress={() => setViewTab('live')}>
            <Text style={[s.viewTabTxt, viewTab === 'live' && s.viewTabTxtActive]}>Live</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.viewTab, viewTab === 'analytics' && s.viewTabActive]} onPress={() => setViewTab('analytics')}>
            <Text style={[s.viewTabTxt, viewTab === 'analytics' && s.viewTabTxtActive]}>Analytics</Text>
          </TouchableOpacity>
        </View>
        {match.lastMilestone && Date.now() - match.lastMilestone.ts < 15000 && (
  <View style={s.milestoneBanner}>
    <Text style={s.milestoneTxt}>🎉 {match.lastMilestone.playerName}: {match.lastMilestone.text}</Text>
  </View>
)}

        <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate('Scorecard', { matchId: matchId.toUpperCase() })}>
  <AppIcon emoji="📊" size={16} color={COLORS.primaryLight} />
  <Text style={s.linkBtnTxt}>View Full Scorecard</Text>
</TouchableOpacity>
{match.tournamentId && (
  <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate('TournamentLeaderboard', { tournamentId: match.tournamentId })}>
    <AppIcon emoji="🏆" size={16} color={COLORS.primaryLight} />
    <Text style={s.linkBtnTxt}>View Tournament Points Table</Text>
  </TouchableOpacity>
)}

        {viewTab === 'live' && (() => {
          const partnership = getCurrentPartnership(inn, match);
          return (
            <>
              {/* Current Partnership */}
              <View style={s.analyticsCard}>
                <Text style={s.analyticsTitle}>Current Partnership</Text>
                <Text style={s.partnershipTxt}>{partnership.runs} runs ({partnership.balls} balls)</Text>
              </View>
            </>
          );
        })()}

        {viewTab === 'analytics' && (() => {
          const worm = getWormData(match);
          const winProb = getWinProbability(match);
          return (
            <>
              {/* Worm Graph */}
              <View style={s.analyticsCard}>
                <Text style={s.analyticsTitle}>Worm Graph</Text>
                <WormGraph
                  innings1Points={worm.innings1}
                  innings2Points={worm.innings2}
                  totalOvers={match.totalOvers}
                  team1Name={match.team1}
                  team2Name={match.team2}
                />
              </View>

              {/* Win Probability */}
              {winProb && (
                <View style={s.analyticsCard}>
                  <Text style={s.analyticsTitle}>Win Probability</Text>
                  <View style={s.winProbBar}>
                    <View style={[s.winProbFill, { flex: winProb.team1, backgroundColor: COLORS.blue }]} />
                    <View style={[s.winProbFill, { flex: winProb.team2, backgroundColor: COLORS.primary }]} />
                  </View>
                  <View style={s.winProbLabels}>
                    <Text style={s.winProbLabel}>{match.team1} {winProb.team1}%</Text>
                    <Text style={s.winProbLabel}>{match.team2} {winProb.team2}%</Text>
                  </View>
                  <Text style={s.winProbNote}>Estimate based on required run rate and wickets in hand — not a statistical prediction.</Text>
                </View>
              )}
            </>
          );
        })()}

        {/* ── NO STREAM PLACEHOLDER ── */}
        {!hasStream && (
          <View style={s.noStreamBox}>
            <View pointerEvents="none" style={s.noStreamEdge} />
            <View style={s.noStreamBadge}><Text style={s.noStreamBadgeTxt}>SCORE ONLY</Text></View>
            <Text style={s.noStreamTxt}>No live video stream available</Text>
            <Text style={s.noStreamSub}>Score is updating live from Firebase</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      <OverSummaryModal
        visible={showOverSummary}
        onClose={() => setShowOverSummary(false)}
        ballHistory={inn?.ballHistory ?? []}
        wormPoints={inn?.wormPoints}
        bowlingPlayers={bolP}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
// Visual pass only. Every key that existed before is still defined under the
// same name — including the four `videoOverlay`/`overlay*` keys and the
// `livePill`/`liveDot`/`liveTxt` trio, which the LiveScoreOverlay and Badge
// components now render instead. Removing a key here is a runtime crash that
// the type-checker cannot catch, so nothing is deleted.
//
// Intent: the score is the loudest thing on the screen (tabular figures, so
// digits don't jump on every ball), each block is a distinct elevated card,
// and the tables use uppercase column labels with hairline row rules.
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  connectTxt: { ...TYPE.body, color: COLORS.textSecondary, marginTop: SPACING.md },

  // Join screen
  joinBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, overflow: 'hidden' },
  joinBlobWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  joinBlob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, opacity: 0.16 },
  joinBadge: { backgroundColor: COLORS.live, paddingHorizontal: 22, paddingVertical: 9, borderRadius: RADIUS.round, marginBottom: SPACING.lg, ...SHADOW.glow(COLORS.live) },
  joinBadgeTxt: { fontSize: 18, fontWeight: '800', letterSpacing: 3, color: '#fff' },
  joinTitle: { ...TYPE.h1, color: COLORS.text, marginBottom: SPACING.sm },
  joinSub: { ...TYPE.caption, fontSize: 13, color: COLORS.textSecondary, marginBottom: 28, textAlign: 'center' },
  joinInput: { backgroundColor: COLORS.card, color: COLORS.text, padding: SPACING.md, borderRadius: RADIUS.lg, fontSize: 22, fontWeight: '700', letterSpacing: 6, textAlign: 'center', width: '100%', borderWidth: 1, borderColor: COLORS.primary + '88', marginBottom: SPACING.md, fontVariant: ['tabular-nums'] },
  joinBtn: { backgroundColor: COLORS.primary, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, width: '100%', alignItems: 'center', marginBottom: SPACING.md, ...SHADOW.glow(COLORS.primary) },
  joinBtnTxt: { ...TYPE.button, fontSize: 16, color: COLORS.onPrimary },
  joinHint: { ...TYPE.caption, color: COLORS.textMuted, textAlign: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 50, paddingBottom: SPACING.sm, backgroundColor: COLORS.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft, position: 'relative' },
  headerAccentLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, flexDirection: 'row', opacity: 0.55 },
  headerAccentHalf: { flex: 1 },
  backBtn: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border },
  backTxt: { ...TYPE.caption, fontWeight: '700', color: COLORS.primaryLight },
  headerCenter: { flex: 1, alignItems: 'center', gap: 5 },
  // Kept for compatibility — the pulsing Badge renders the LIVE indicator now.
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.live, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.round, gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTxt: { ...TYPE.label, fontSize: 9, color: '#fff' },
  headerTeams: { ...TYPE.caption, fontWeight: '700', color: COLORS.text },
  matchIdTxt: { ...TYPE.numSm, fontSize: 11, color: COLORS.textMuted },
  scroll: { flex: 1 },

  // Video — deliberately full-bleed and square-cornered: a WebView inside a
  // rounded, overflow-hidden parent clips badly on Android.
  videoBox: { height: 220, backgroundColor: '#000', position: 'relative' },
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d0d0d' },
  videoPlaceholderTxt: { ...TYPE.body, color: 'rgba(255,255,255,0.75)' },
  videoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.scrim, paddingHorizontal: 12, paddingVertical: SPACING.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  overlayLeft: {},
  overlayScore: { ...TYPE.displaySm, color: '#fff' },
  overlayOvers: { ...TYPE.numSm, fontSize: 13, color: COLORS.primaryLight },
  overlayRight: { alignItems: 'flex-end' },
  overlayTeam: { ...TYPE.caption, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  overlayRR: { ...TYPE.numSm, color: '#fff' },
  overlayTgt: { ...TYPE.num, fontSize: 13, color: COLORS.live },
  videoToggle: { backgroundColor: COLORS.card2, paddingVertical: 9, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  videoToggleTxt: { ...TYPE.caption, fontWeight: '700', color: COLORS.primaryLight },

  // Score card — the dominant element. Violet top stripe + heaviest elevation
  // so it reads as a broadcast scoreboard rather than one more card.
  scoreCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: SPACING.sm, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, borderTopWidth: 3, borderTopColor: COLORS.primary, overflow: 'hidden', ...SHADOW.lg },
  scoreCardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  scoreCardTint: { position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primary, opacity: 0.1 },
  scoreCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  scoreCardTeam: { ...TYPE.caption, fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, flex: 1 },
  scoreCardInn: { ...TYPE.numSm, fontSize: 11, color: COLORS.primaryLight },
  overSummaryBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: COLORS.card2, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  overSummaryBtnTxt: { color: COLORS.text, fontSize: 11, fontWeight: "600" },
  scoreMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: SPACING.md },
  scoreBig: { fontSize: 54, fontWeight: '800', lineHeight: 58, letterSpacing: -1.5, color: COLORS.text, fontVariant: ['tabular-nums'] },
  scoreMeta: { alignItems: 'flex-end', paddingBottom: 7 },
  scoreOvers: { ...TYPE.num, fontSize: 16, color: COLORS.primaryLight },
  scoreRR: { ...TYPE.numSm, color: COLORS.textSecondary, marginTop: 1 },
  scoreTgt: { ...TYPE.num, fontSize: 13, color: COLORS.live, marginTop: 4 },
  scoreRRR: { ...TYPE.numSm, color: COLORS.warning, marginTop: 1 },
  ballsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft, paddingTop: SPACING.sm },
  ballsLbl: { ...TYPE.label, fontSize: 9, color: COLORS.textMuted },
  ball: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  bW: { backgroundColor: COLORS.error, borderColor: COLORS.error }, b4: { backgroundColor: COLORS.blue, borderColor: COLORS.blue }, b6: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow }, bExtra: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  ballTxt: { ...TYPE.numSm, fontSize: 9, color: COLORS.text },

  // Players card
  playersCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: SPACING.sm, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden', ...SHADOW.md },
  playersCardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  playersSectionLbl: { ...TYPE.label, fontSize: 10, color: COLORS.primaryLight, marginBottom: 7, marginTop: 6 },
  playerTableHeader: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 2 },
  phCell: { flex: 1, textAlign: 'center', ...TYPE.colLabel, fontSize: 10, color: COLORS.textMuted },
  phName: { flex: 2.5, textAlign: 'left' },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  // The batter on strike: a tinted row, no extra border, so the eye lands on
  // it without the table gaining a second grid line.
  strikerRow: { backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.sm },
  pdCell: { flex: 1, textAlign: 'center', justifyContent: 'center', alignItems: 'center' },
  pdName: { flex: 2.5, textAlign: 'left', alignItems: 'flex-start' },
  pdStat: { ...TYPE.numSm, fontSize: 13, color: COLORS.textSecondary },
  /** Runs on strike, wickets for the bowler — the figures the row exists for. */
  pdStatStrong: { ...TYPE.num, fontSize: 15, color: COLORS.primaryLight },
  strikerName: { ...TYPE.title, fontSize: 14, color: COLORS.text },
  nonStrikerName: { ...TYPE.body, fontSize: 13, color: COLORS.textSecondary },
  bowlerName: { ...TYPE.bodyStrong, fontSize: 13, color: COLORS.text },
  playerRoleLbl: { ...TYPE.label, fontSize: 8, color: COLORS.textMuted, marginTop: 2 },
  playerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

  // Extras
  extrasCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.card2, marginHorizontal: SPACING.md, marginTop: 6, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.borderSoft },
  extrasLbl: { ...TYPE.num, fontSize: 12, color: COLORS.textSecondary },
  extrasDtl: { ...TYPE.numSm, fontSize: 11, color: COLORS.textMuted },

  // No stream
  noStreamBox: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: SPACING.sm, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden', ...SHADOW.sm },
  noStreamEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  noStreamBadge: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.round, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  noStreamBadgeTxt: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  noStreamTxt: { ...TYPE.bodyStrong, color: COLORS.textSecondary, marginBottom: 3 },
  noStreamSub: { ...TYPE.caption, color: COLORS.textMuted, textAlign: 'center' },

  viewTabs: { flexDirection: 'row', marginHorizontal: SPACING.md, marginTop: SPACING.sm, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 3, gap: 3, borderWidth: 1, borderColor: COLORS.borderSoft },
  viewTab: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.sm, alignItems: 'center' },
  viewTabActive: { backgroundColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  viewTabTxt: { ...TYPE.caption, fontWeight: '700', color: COLORS.textSecondary },
  viewTabTxtActive: { color: COLORS.onPrimary },
  analyticsCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: SPACING.sm, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.sm },
  analyticsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  analyticsTitle: { ...TYPE.label, color: COLORS.primaryLight, marginBottom: SPACING.sm },
  commentaryTxt: { ...TYPE.body, color: COLORS.text, lineHeight: 21 },
  commentaryTxtBig: { ...TYPE.body, color: COLORS.text, lineHeight: 23, fontSize: 15, fontWeight: '600' },
  commentaryCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: SPACING.sm, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, borderColor: COLORS.primary + '55', overflow: 'hidden', ...SHADOW.sm },
  commentaryEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  commentaryEmpty: { ...TYPE.caption, color: COLORS.textMuted, fontStyle: 'italic' },
  partnershipTxt: { ...TYPE.displaySm, fontSize: 22, color: COLORS.text },
  bbRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  bbOver: { ...TYPE.numSm, color: COLORS.textMuted, width: 44 },
  bbResult: { ...TYPE.num, fontSize: 13, color: COLORS.text, flex: 1 },
  winProbBar: { flexDirection: 'row', height: 22, borderRadius: RADIUS.round, overflow: 'hidden', marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderSoft },
  winProbFill: { height: '100%' },
  winProbLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  winProbLabel: { ...TYPE.numSm, color: COLORS.text },
  winProbNote: { ...TYPE.caption, fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic', lineHeight: 15 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: SPACING.sm, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.sm },
  linkBtnTxt: { ...TYPE.button, fontSize: 13, color: COLORS.primaryLight },
  milestoneBanner: { backgroundColor: COLORS.yellow + '14', marginHorizontal: SPACING.md, marginTop: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.yellow + '55', borderLeftWidth: 3, borderLeftColor: COLORS.yellow, alignItems: 'center', ...SHADOW.md },
  milestoneTxt: { ...TYPE.bodyStrong, color: COLORS.yellow, textAlign: 'center' },
});
