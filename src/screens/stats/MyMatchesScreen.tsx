import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getMyLinkedPlayerId, getMatchesForPlayer } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import { AdBanner } from '../../components/AdPlaceholder';

export default function MyMatchesScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [myPlayerId, setMyPlayerId] = useState<string|null>(null);
  const [myName, setMyName] = useState<string>('');
  const [matches, setMatches] = useState<any[]>([]);
  const [tab, setTab] = useState<'batting'|'bowling'|'fielding'>('batting');

  useEffect(() => {
    (async () => {
      try {
        const pid = await getMyLinkedPlayerId();
        setMyPlayerId(pid);
        if (pid) {
          const m = await getMatchesForPlayer(pid);
          setMatches(m ?? []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  if (!myPlayerId) {
    return (
      <View style={s.container}>
        <Header title="My Matches" onBack={() => navigation.goBack()} rightText="History" onRight={() => navigation.navigate('MatchHistoryDetail')} />
        <View style={s.empty}>
          <Text style={s.emptyTxt}>No Player Profile Linked</Text>
          <Text style={s.emptySub}>
            Create or edit a team and mark your own player entry as "Me" to start tracking your personal career statistics here.
          </Text>
          <TouchableOpacity style={s.startBtn} onPress={() => navigation.navigate('MyTeams')}>
            <Text style={s.startBtnTxt}>Go to Teams</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border }}>
          <AdBanner />
        </View>
      </View>
    );
  }

  const tournamentMatchCount = matches.filter((m: any) => !!m.tournamentId).length;

  // ── BATTING aggregation ──────────────────────────────────
  const batAgg = { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, innings: 0, scores: [] as number[] };
  // ── BOWLING aggregation ──────────────────────────────────
  const bolAgg = { overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, innings: 0, figures: [] as any[] };
  // ── FIELDING aggregation ─────────────────────────────────
  // fieldingStats is keyed by safeFieldKey(playerName) with each entry
  // containing { displayName, catches, runOuts, stumpings, globalPlayerId }.
  // We match on globalPlayerId === myPlayerId to find only the logged-in
  // user's fielding entries, then sum across all matches and both innings.
  const fieldAgg = { catches: 0, runOuts: 0, stumpings: 0, matchesWithFielding: 0 };
  // Track matches where the user appeared as a fielder (for the "matches" count)
  const fieldMatchIds = new Set<string>();

  matches.forEach((m: any) => {
    [m.innings1, m.innings2].forEach((inn: any) => {
      if (!inn) return;

      // Batting
      const bs: any = Object.values(inn.batsmanStats ?? {}).find((x: any) => x?.globalPlayerId === myPlayerId);
      if (bs) {
        if (!myName && bs.playerId !== undefined) {
          const roster = [...(m.team1Players ?? []), ...(m.team2Players ?? [])];
          const found = roster.find((p: any) => p.globalPlayerId === myPlayerId);
          if (found) setMyName(found.name);
        }
        batAgg.runs  += bs.runs  ?? 0;
        batAgg.balls += bs.balls ?? 0;
        batAgg.fours += bs.fours ?? 0;
        batAgg.sixes += bs.sixes ?? 0;
        if ((bs.balls ?? 0) > 0) { batAgg.innings += 1; batAgg.scores.push(bs.runs ?? 0); }
        if (bs.isOut) batAgg.outs += 1;
      }

      // Bowling
      const bw: any = Object.values(inn.bowlerStats ?? {}).find((x: any) => x?.globalPlayerId === myPlayerId);
      if (bw) {
        bolAgg.overs   += bw.overs   ?? 0;
        bolAgg.balls   += bw.balls   ?? 0;
        bolAgg.runs    += bw.runs    ?? 0;
        bolAgg.wickets += bw.wickets ?? 0;
        bolAgg.wides   += bw.wides   ?? 0;
        bolAgg.noBalls += bw.noBalls ?? 0;
        if ((bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0) {
          bolAgg.innings += 1;
          bolAgg.figures.push({ w: bw.wickets ?? 0, r: bw.runs ?? 0 });
        }
      }

      // Fielding — match on globalPlayerId in each fieldingStats entry
      const fieldEntries: any[] = Object.values(inn.fieldingStats ?? {}).filter(
        (x: any) => x?.globalPlayerId === myPlayerId
      );
      if (fieldEntries.length > 0) fieldMatchIds.add(m.id);
      fieldEntries.forEach((fe: any) => {
        fieldAgg.catches   += fe.catches   ?? 0;
        fieldAgg.runOuts   += fe.runOuts   ?? 0;
        fieldAgg.stumpings += fe.stumpings ?? 0;
      });
    });
  });

  fieldAgg.matchesWithFielding = fieldMatchIds.size;

  const totalDismissals = fieldAgg.catches + fieldAgg.runOuts + fieldAgg.stumpings;

  // Batting derived
  const avg = batAgg.outs > 0 ? (batAgg.runs / batAgg.outs).toFixed(1) : batAgg.runs > 0 ? batAgg.runs + '*' : '0';
  const sr  = batAgg.balls > 0 ? ((batAgg.runs / batAgg.balls) * 100).toFixed(1) : '0.0';
  const hs  = batAgg.scores.length > 0 ? Math.max(...batAgg.scores) : 0;
  const fifties  = batAgg.scores.filter(x => x >= 50 && x < 100).length;
  const hundreds = batAgg.scores.filter(x => x >= 100).length;

  // Bowling derived
  const totalOv = bolAgg.overs + bolAgg.balls / 6;
  const eco  = totalOv > 0 ? (bolAgg.runs / totalOv).toFixed(2) : '0.00';
  const bbf  = bolAgg.figures.length > 0
    ? [...bolAgg.figures].sort((a, b) => b.w - a.w || a.r - b.r)[0]
    : null;

  const StatRow = ({ label, value, highlight }: any) => (
    <View style={s.statRow}>
      <Text style={s.statLbl}>{label}</Text>
      <Text style={[s.statVal, highlight && { color: COLORS.primary, fontWeight: 'bold' }]}>{value ?? '-'}</Text>
    </View>
  );

  const TABS = [
    { key: 'batting',  label: 'Batting' },
    { key: 'bowling',  label: 'Bowling' },
    { key: 'fielding', label: 'Fielding' },
  ];

  return (
    <View style={s.container}>
      <Header
        title="My Matches"
        onBack={() => navigation.goBack()}
        rightText="History"
        onRight={() => navigation.navigate('MatchHistoryDetail')}
      />

      <View style={s.profileBanner}>
        <View style={s.profileAvatar}>
          <Text style={s.profileAvatarTxt}>{(myName || 'M').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.profileName}>{myName || 'My Profile'}</Text>
          <Text style={s.profileSub}>
            {matches.length} match{matches.length !== 1 ? 'es' : ''} played
            {tournamentMatchCount > 0 ? ' • ' + tournamentMatchCount + ' tournament' : ''}
          </Text>
        </View>
      </View>

      {matches.length > 0 && (() => {
        const formResults = matches
          .filter((m: any) => m.status === 'completed')
          .slice(0, 5)
          .map((m: any) => {
            const w = m.winner ?? '';
            const isPlayerTeam1 = (m.team1Players ?? []).some((p: any) => p.globalPlayerId === myPlayerId);
            const won = w.includes((isPlayerTeam1 ? m.team1 : m.team2) + ' won');
            const lost = w.includes((isPlayerTeam1 ? m.team2 : m.team1) + ' won');
            if (w.toLowerCase().includes('tied')) return 'T';
            if (won) return 'W';
            if (lost) return 'L';
            return null;
          })
          .filter(Boolean);
        if (formResults.length === 0) return null;
        return (
          <View style={s.formCard}>
            <Text style={s.formLabel}>RECENT FORM</Text>
            <View style={s.formRow}>
              {formResults.map((r: any, i: number) => (
                <View key={i} style={[
                  s.formPill,
                  r === 'W' && { backgroundColor: COLORS.primary },
                  r === 'L' && { backgroundColor: COLORS.red },
                  r === 'T' && { backgroundColor: COLORS.orange },
                ]}>
                  <Text style={s.formPillTxt}>{r}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => setTab(t.key as any)}
          >
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── BATTING TAB ── */}
        {tab === 'batting' && (
          <View style={s.statsArea}>
            {batAgg.innings === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyTxt}>No batting stats yet</Text>
                <Text style={s.emptySub}>Score matches where you are a player to see your batting stats here.</Text>
              </View>
            ) : (
              <View style={s.pCard}>
                <View style={s.pCardHead}>
                  <View style={s.pAvatar}>
                    <Text style={s.pAvatarTxt}>{(myName || 'M').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pName}>{myName || 'Me'}</Text>
                    <Text style={s.pSub}>{batAgg.innings} innings</Text>
                  </View>
                  <View style={s.pHighlight}>
                    <Text style={s.pHNum}>{batAgg.runs}</Text>
                    <Text style={s.pHLbl}>RUNS</Text>
                  </View>
                </View>
                <StatRow label="Balls Faced"   value={batAgg.balls} />
                <StatRow label="4s"            value={batAgg.fours} />
                <StatRow label="6s"            value={batAgg.sixes} />
                <StatRow label="Strike Rate"   value={sr}  highlight />
                <StatRow label="Average"       value={avg} highlight />
                <StatRow label="Highest Score" value={hs}  highlight />
                <StatRow label="50s"           value={fifties} />
                <StatRow label="100s"          value={hundreds} />
              </View>
            )}
          </View>
        )}

        {/* ── BOWLING TAB ── */}
        {tab === 'bowling' && (
          <View style={s.statsArea}>
            {bolAgg.innings === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyTxt}>No bowling stats yet</Text>
                <Text style={s.emptySub}>Score matches where you bowl to see your bowling stats here.</Text>
              </View>
            ) : (
              <View style={s.pCard}>
                <View style={s.pCardHead}>
                  <View style={[s.pAvatar, { backgroundColor: COLORS.red }]}>
                    <Text style={s.pAvatarTxt}>{(myName || 'M').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pName}>{myName || 'Me'}</Text>
                    <Text style={s.pSub}>{bolAgg.innings} innings</Text>
                  </View>
                  <View style={[s.pHighlight, { backgroundColor: COLORS.red + '22', borderColor: COLORS.red }]}>
                    <Text style={[s.pHNum, { color: COLORS.red }]}>{bolAgg.wickets}</Text>
                    <Text style={s.pHLbl}>WKTS</Text>
                  </View>
                </View>
                <StatRow label="Overs"         value={bolAgg.overs + '.' + bolAgg.balls} />
                <StatRow label="Runs Conceded" value={bolAgg.runs} />
                <StatRow label="Economy"       value={eco} highlight />
                <StatRow label="Best Bowling"  value={bbf ? bbf.w + '/' + bbf.r : '-'} highlight />
                <StatRow label="Wides"         value={bolAgg.wides} />
                <StatRow label="No Balls"      value={bolAgg.noBalls} />
              </View>
            )}
          </View>
        )}

        {/* ── FIELDING TAB ── */}
        {tab === 'fielding' && (
          <View style={s.statsArea}>
            {/* Summary grid — always visible so user sees matches count even with 0 dismissals */}
            <View style={s.fieldGrid}>
              {[
                { icon: '🧤', label: 'Catches',   value: fieldAgg.catches,            color: COLORS.blue },
                { icon: '🏃', label: 'Run Outs',  value: fieldAgg.runOuts,            color: COLORS.orange },
                { icon: '🥅', label: 'Stumpings', value: fieldAgg.stumpings,          color: COLORS.purple },
                { icon: '📋', label: 'Matches',   value: matches.length,              color: COLORS.primary },
              ].map((f, i) => (
                <View key={i} style={[s.fieldBox, { borderColor: f.color }]}>
                  <View style={[s.fieldIcon, { backgroundColor: f.color + '22' }]}>
                    <Text style={s.fieldIconTxt}>{f.icon}</Text>
                  </View>
                  <Text style={[s.fieldVal, { color: f.color }]}>{f.value}</Text>
                  <Text style={s.fieldLbl}>{f.label}</Text>
                </View>
              ))}
            </View>

            {totalDismissals === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyTxt}>No fielding stats yet</Text>
                <Text style={s.emptySub}>
                  Fielding stats are recorded when a fielder is selected during Caught, Stumped, or Run Out dismissals while scoring.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border }}>
        <AdBanner />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  profileBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  profileAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  profileAvatarTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  profileName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  profileSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  formCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 14, margin: SPACING.lg, marginBottom: 0, borderWidth: 1, borderColor: COLORS.border },
  formLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: 'bold', letterSpacing: 1.2, marginBottom: 10 },
  formRow: { flexDirection: 'row', gap: 9 },
  formPill: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center' },
  formPillTxt: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabTxt: { color: COLORS.textSecondary, fontSize: 12, fontWeight: 'bold' },
  tabTxtActive: { color: COLORS.primary },
  scroll: { flex: 1 },
  statsArea: { padding: SPACING.lg, gap: 14 },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: SPACING.xl },
  emptyTxt: { color: COLORS.textSecondary, fontSize: 15, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  startBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS.round },
  startBtnTxt: { color: '#fff', fontWeight: 'bold' },
  pCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  pCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  pAvatarTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  pName: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  pSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  pHighlight: { backgroundColor: COLORS.primary + '22', borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary },
  pHNum: { color: COLORS.primary, fontSize: 22, fontWeight: 'bold' },
  pHLbl: { color: COLORS.textMuted, fontSize: 9 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border + '66' },
  statLbl: { color: COLORS.textSecondary, fontSize: 13 },
  statVal: { color: COLORS.text, fontSize: 13 },
  // Fielding summary grid
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldBox: { width: '46%', backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 16, alignItems: 'center', borderWidth: 1 },
  fieldIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  fieldIconTxt: { fontSize: 20 },
  fieldVal: { fontSize: 28, fontWeight: 'bold' },
  fieldLbl: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
});
