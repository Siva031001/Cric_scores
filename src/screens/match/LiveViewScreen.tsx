import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { subscribeToMatch } from '../../utils/firebase';
import { getOversString, getRunRate, getRequiredRunRate, statKey } from '../../utils/cricketLogic';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import LiveScoreOverlay from '../../components/LiveScoreOverlay';
import { getBallByBall, getCurrentPartnership, getWormData, getWinProbability } from '../../utils/matchAnalytics';
import WormGraph from '../../components/WormGraph';

const { width: SW } = Dimensions.get('window');

export default function LiveViewScreen({ navigation }: any) {
  const [matchId, setMatchId] = useState('');
  const [match, setMatch] = useState<any>(null);
  const [watching, setWatching] = useState(false);
  const [videoVisible, setVideoVisible] = useState(true);
  const [viewTab, setViewTab] = useState<'live'|'analytics'>('live');

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
      {/* Custom header with LIVE badge */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => { setWatching(false); setMatch(null); }}>
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.livePill}>
            <View style={s.liveDot} />
            <Text style={s.liveTxt}>LIVE</Text>
          </View>
          <Text style={s.headerTeams}>{match.team1} vs {match.team2}</Text>
        </View>
        <Text style={s.matchIdTxt}>#{matchId.toUpperCase()}</Text>
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
          <View style={s.scoreCardTop}>
            <Text style={s.scoreCardTeam}>{match.currentInnings === 1 ? match.team1 : match.team2} batting</Text>
            <Text style={s.scoreCardInn}>Innings {match.currentInnings}</Text>
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

        {/* ── BATSMEN (CricHeroes style) ── */}
        <View style={s.playersCard}>
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
            <Text style={[s.pdCell, s.pdStat, {color: COLORS.primary, fontWeight:'bold'}]}>{ss?.runs ?? 0}</Text>
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
            <Text style={[s.pdCell, s.pdStat, {color: (bws?.wickets ?? 0) > 0 ? COLORS.red : COLORS.text}]}>{bws?.wickets ?? 0}</Text>
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
  <Text style={s.linkBtnTxt}>📊 View Full Scorecard</Text>
</TouchableOpacity>
{match.tournamentId && (
  <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate('TournamentLeaderboard', { tournamentId: match.tournamentId })}>
    <Text style={s.linkBtnTxt}>🏆 View Tournament Points Table</Text>
  </TouchableOpacity>
)}

<View style={s.analyticsCard}>
  <Text style={s.analyticsTitle}>🤖 AI Commentary</Text>
  {inn?.latestCommentaryText ? (
    <Text style={{ color: COLORS.text, fontSize: 14 }}>{inn.latestCommentaryText}</Text>
  ) : (
    <Text style={{ color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic' }}>Commentary will appear here once scoring begins.</Text>
  )}
</View>

        {viewTab === 'live' && (() => {
          const partnership = getCurrentPartnership(inn, match);
          const ballByBall = getBallByBall(inn, 12);
          return (
            <>
              {/* Current Partnership */}
              <View style={s.analyticsCard}>
                <Text style={s.analyticsTitle}>Current Partnership</Text>
                <Text style={s.partnershipTxt}>{partnership.runs} runs ({partnership.balls} balls)</Text>
              </View>

              {/* Ball-by-Ball feed */}
              <View style={s.analyticsCard}>
                <Text style={s.analyticsTitle}>Ball-by-Ball</Text>
                {ballByBall.map((b: any, i: number) => (
                  <View key={i} style={s.bbRow}>
                    <Text style={s.bbOver}>{b.over}.{b.ball ?? ''}</Text>
                    <Text style={s.bbResult}>{b.result}</Text>
                  </View>
                ))}
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
            <View style={s.noStreamBadge}><Text style={s.noStreamBadgeTxt}>SCORE ONLY</Text></View>
            <Text style={s.noStreamTxt}>No live video stream available</Text>
            <Text style={s.noStreamSub}>Score is updating live from Firebase</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  connectTxt: { color: COLORS.textSecondary, marginTop: 12 },

  // Join screen
  joinBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  joinBadge: { backgroundColor: COLORS.red, paddingHorizontal: 20, paddingVertical: 8, borderRadius: RADIUS.round, marginBottom: 20 },
  joinBadgeTxt: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  joinTitle: { color: COLORS.text, fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  joinSub: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 28, textAlign: 'center' },
  joinInput: { backgroundColor: COLORS.card, color: COLORS.text, padding: 16, borderRadius: RADIUS.md, fontSize: 22, letterSpacing: 6, textAlign: 'center', width: '100%', borderWidth: 2, borderColor: COLORS.primary, marginBottom: 16 },
  joinBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.md, width: '100%', alignItems: 'center', marginBottom: 12 },
  joinBtnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  joinHint: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 50, paddingBottom: 10, backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border },
  backTxt: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.round, gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  headerTeams: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  matchIdTxt: { color: COLORS.textMuted, fontSize: 11 },
  scroll: { flex: 1 },

  // Video
  videoBox: { height: 220, backgroundColor: '#000', position: 'relative' },
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  videoPlaceholderTxt: { color: '#fff', fontSize: 14 },
  videoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  overlayLeft: {},
  overlayScore: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  overlayOvers: { color: COLORS.primary, fontSize: 13 },
  overlayRight: { alignItems: 'flex-end' },
  overlayTeam: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  overlayRR: { color: '#fff', fontSize: 12 },
  overlayTgt: { color: COLORS.red, fontSize: 12, fontWeight: 'bold' },
  videoToggle: { backgroundColor: COLORS.card2, padding: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  videoToggleTxt: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold' },

  // Score card
  scoreCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: 10, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + '55' },
  scoreCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  scoreCardTeam: { color: COLORS.textSecondary, fontSize: 11 },
  scoreCardInn: { color: COLORS.primary, fontSize: 11 },
  scoreMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  scoreBig: { color: COLORS.text, fontSize: 52, fontWeight: 'bold', lineHeight: 58 },
  scoreMeta: { alignItems: 'flex-end', paddingBottom: 6 },
  scoreOvers: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
  scoreRR: { color: COLORS.textSecondary, fontSize: 12 },
  scoreTgt: { color: COLORS.red, fontSize: 13, fontWeight: 'bold' },
  scoreRRR: { color: COLORS.orange, fontSize: 12 },
  ballsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  ballsLbl: { color: COLORS.textMuted, fontSize: 10 },
  ball: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  bW: { backgroundColor: COLORS.red }, b4: { backgroundColor: COLORS.blue }, b6: { backgroundColor: COLORS.yellow }, bExtra: { backgroundColor: COLORS.orange },
  ballTxt: { color: COLORS.text, fontSize: 8, fontWeight: 'bold' },

  // Players card
  playersCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: 8, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  playersSectionLbl: { color: COLORS.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  playerTableHeader: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 4 },
  phCell: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 10, fontWeight: 'bold' },
  phName: { flex: 2.5, textAlign: 'left' },
  playerRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  strikerRow: { backgroundColor: COLORS.primary + '11', borderRadius: RADIUS.sm },
  pdCell: { flex: 1, textAlign: 'center', justifyContent: 'center', alignItems: 'center' },
  pdName: { flex: 2.5, textAlign: 'left', alignItems: 'flex-start' },
  pdStat: { color: COLORS.text, fontSize: 13 },
  strikerName: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  nonStrikerName: { color: COLORS.textSecondary, fontSize: 13 },
  bowlerName: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  playerRoleLbl: { color: COLORS.textMuted, fontSize: 9, marginTop: 1 },
  playerDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },

  // Extras
  extrasCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card2, marginHorizontal: SPACING.md, marginTop: 6, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8 },
  extrasLbl: { color: COLORS.textSecondary, fontSize: 12, fontWeight: 'bold' },
  extrasDtl: { color: COLORS.textMuted, fontSize: 11 },

  // No stream
  noStreamBox: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: 8, borderRadius: RADIUS.md, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  noStreamBadge: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.round, marginBottom: 10 },
  noStreamBadgeTxt: { color: COLORS.textSecondary, fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  noStreamTxt: { color: COLORS.textSecondary, fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  noStreamSub: { color: COLORS.textMuted, fontSize: 12 },

  viewTabs: { flexDirection: 'row', marginHorizontal: SPACING.md, marginTop: 8, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 3, gap: 3 },
  viewTab: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.sm, alignItems: 'center' },
  viewTabActive: { backgroundColor: COLORS.primary },
  viewTabTxt: { color: COLORS.textSecondary, fontSize: 12, fontWeight: 'bold' },
  viewTabTxtActive: { color: '#fff' },
  analyticsCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: 8, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  analyticsTitle: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold', marginBottom: 8, letterSpacing: 0.5 },
  partnershipTxt: { color: COLORS.text, fontSize: 20, fontWeight: 'bold' },
  bbRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  bbOver: { color: COLORS.textMuted, fontSize: 12, width: 50 },
  bbResult: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  winProbBar: { flexDirection: 'row', height: 24, borderRadius: RADIUS.round, overflow: 'hidden', marginBottom: 8 },
  winProbFill: { height: '100%' },
  winProbLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  winProbLabel: { color: COLORS.text, fontSize: 12, fontWeight: 'bold' },
  winProbNote: { color: COLORS.textMuted, fontSize: 10, fontStyle: 'italic' },
  linkBtn: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: 8, padding: 14, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  linkBtnTxt: { color: COLORS.primary, fontWeight: 'bold', fontSize: 13 },
  milestoneBanner: { backgroundColor: COLORS.yellow + '33', margin: SPACING.md, padding: 14, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.yellow, alignItems: 'center' },
  milestoneTxt: { color: COLORS.yellow, fontWeight: 'bold', fontSize: 14 },
});
