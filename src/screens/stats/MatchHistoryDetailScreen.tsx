import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getMatchHistory } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

// -- Ball-result run helper (mirrors cricketLogic's rotation logic but
// returns TOTAL runs added to the team for a ball, used for partnerships) --
const getBallTotalRuns = (result: string) => {
  if (!result || result === 'W' || result.startsWith('W(')) return 0;
  if (/^\d+$/.test(result)) return parseInt(result);
  if (result.startsWith('WD')) return result === 'WD' ? 1 : 1 + (parseInt(result.replace('WD', '')) || 0);
  if (result.startsWith('NB')) return result === 'NB' ? 1 : 1 + (parseInt(result.replace('NB', '')) || 0);
  if (result.startsWith('LB')) return parseInt(result.replace('LB', '')) || 0;
  if (result.startsWith('B')) return parseInt(result.replace('B', '')) || 0;
  if (result.startsWith('PEN')) return parseInt(result.replace('PEN', '')) || 0;
  return 0;
};
const isWicketResult = (result: string) => result === 'W' || (result ?? '').startsWith('W(');

// -- Reconstruct partnerships for one innings from ballHistory --
const getPartnerships = (inn: any, players: any[]) => {
  const history = inn?.ballHistory ?? [];
  const out: any[] = [];
  if (history.length === 0) return out;

  const nameOf = (id: number) => players?.find((p: any) => p.id === id)?.name ?? ('P' + (id + 1));

  let a: number | null = null;
  let b: number | null = null;
  let runs = 0;
  let balls = 0;
  let survivor: number | null = null;

  history.forEach((h: any) => {
    if (h.type === 'NEW_BATSMAN') {
      if (survivor !== null) {
        a = survivor;
        b = h.newBatsmanId;
        survivor = null;
        runs = 0;
        balls = 0;
      }
      return;
    }
    if (a === null) { a = h.batsmanId; b = h.nonStrikerIdBefore; }
    runs += getBallTotalRuns(h.result);
    if (!(h.result ?? '').startsWith('WD') && !(h.result ?? '').startsWith('NB')) balls += 1;

    if (isWicketResult(h.result)) {
      out.push({ names: nameOf(a as number) + ' & ' + nameOf(b as number), runs, balls, unbeaten: false });
      const dismissedId = h.batsmanId;
      survivor = dismissedId === a ? b : a;
      a = null; b = null;
    }
  });

  if (a !== null && b !== null && (runs > 0 || balls > 0)) {
    out.push({ names: nameOf(a as number) + ' & ' + nameOf(b as number), runs, balls, unbeaten: true });
  }
  return out;
};

type SortKey = 'runs' | 'avg' | 'sr' | 'wickets' | 'eco' | 'bowlAvg';
type DateFilter = 'all' | '30' | '90';

export default function MatchHistoryDetailScreen({ navigation }: any) {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview'|'batting'|'bowling'|'fielding'>('overview');
  const [filter, setFilter] = useState<string>('all');
  const [matchTypeFilter, setMatchTypeFilter] = useState<'all'|'tournament'|'normal'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [batSort, setBatSort] = useState<SortKey>('runs');
  const [bolSort, setBolSort] = useState<SortKey>('wickets');

  useEffect(() => {
    getMatchHistory()
      .then(d => {
        const sorted = (d ?? []).sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setMatches(sorted);
      })
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingTxt}>Loading your match history...</Text>
      </View>
    );
  }

  const now = Date.now();
  const dateFilteredMatches = dateFilter === 'all'
    ? matches
    : matches.filter((m: any) => (now - (m.createdAt ?? 0)) <= parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  const typeFilteredMatches = matchTypeFilter === 'all'
    ? dateFilteredMatches
    : matchTypeFilter === 'tournament'
      ? dateFilteredMatches.filter((m: any) => !!m.tournamentId)
      : dateFilteredMatches.filter((m: any) => !m.tournamentId);

  const formResults = typeFilteredMatches
    .filter((m: any) => m.status === 'completed')
    .slice(0, 5)
    .map((m: any) => {
      const w = m.winner ?? '';
      if (w.toLowerCase().includes('tied') || w.toLowerCase().includes('tie')) return 'T';
      if (w.includes(m.team1 + ' won')) return 'W';
      if (w.includes(m.team2 + ' won')) return 'L';
      return null;
    })
    .filter(Boolean);

  const batMap: any = {};
  typeFilteredMatches.forEach((m: any) => {
    const inn = m.innings1;
    if (!inn?.batsmanStats) return;
    const myIds = new Set((m.team1Players ?? []).map((p: any) => String(p.id)));
    Object.values(inn.batsmanStats).forEach((bs: any) => {
      if (!bs) return;
      const k = String(bs.playerId ?? 0);
      if (!myIds.has(k)) return;
      const pName = (m.team1Players ?? []).find((p: any) => String(p.id) === k)?.name ?? ('Player ' + (parseInt(k) + 1));
      if (!batMap[k]) batMap[k] = { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, innings: 0, scores: [], name: pName };
      batMap[k].runs += bs.runs ?? 0;
      batMap[k].balls += bs.balls ?? 0;
      batMap[k].fours += bs.fours ?? 0;
      batMap[k].sixes += bs.sixes ?? 0;
      if ((bs.balls ?? 0) > 0) { batMap[k].innings += 1; batMap[k].scores.push(bs.runs ?? 0); }
      if (bs.isOut) batMap[k].outs += 1;
      batMap[k].name = pName;
    });
  });

  const bolMap: any = {};
  typeFilteredMatches.forEach((m: any) => {
    const inn = m.innings2;
    if (!inn?.bowlerStats) return;
    const myIds = new Set((m.team1Players ?? []).map((p: any) => String(p.id)));
    Object.values(inn.bowlerStats).forEach((bw: any) => {
      if (!bw) return;
      const k = String(bw.playerId ?? 0);
      if (!myIds.has(k)) return;
      const pName = (m.team1Players ?? []).find((p: any) => String(p.id) === k)?.name ?? ('Player ' + (parseInt(k) + 1));
      if (!bolMap[k]) bolMap[k] = { overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, innings: 0, figures: [], name: pName };
      bolMap[k].overs += bw.overs ?? 0;
      bolMap[k].balls += bw.balls ?? 0;
      bolMap[k].runs += bw.runs ?? 0;
      bolMap[k].wickets += bw.wickets ?? 0;
      bolMap[k].wides += bw.wides ?? 0;
      bolMap[k].noBalls += bw.noBalls ?? 0;
      if ((bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0) {
        bolMap[k].innings += 1;
        bolMap[k].figures.push({ w: bw.wickets ?? 0, r: bw.runs ?? 0 });
      }
      bolMap[k].name = pName;
    });
  });

  const fieldMap: any = {};
  typeFilteredMatches.forEach((m: any) => {
    [m.innings1, m.innings2].forEach((inn: any) => {
      if (!inn?.fieldingStats) return;
      Object.values(inn.fieldingStats).forEach((fs: any) => {
        if (!fs) return;
        const name = fs.displayName ?? 'Unknown';
        if (!fieldMap[name]) fieldMap[name] = { name, catches: 0, runOuts: 0, stumpings: 0 };
        fieldMap[name].catches   += fs.catches   ?? 0;
        fieldMap[name].runOuts   += fs.runOuts   ?? 0;
        fieldMap[name].stumpings += fs.stumpings ?? 0;
      });
    });
  });
  const fieldTotals = (Object.values(fieldMap) as any[]).reduce(
    (acc: any, f: any) => ({
      catches: acc.catches + (f.catches ?? 0),
      runOuts: acc.runOuts + (f.runOuts ?? 0),
      stumpings: acc.stumpings + (f.stumpings ?? 0),
    }),
    { catches: 0, runOuts: 0, stumpings: 0 }
  );
  const fieldRows = (Object.values(fieldMap) as any[]).sort(
    (a: any, b: any) => (b.catches + b.runOuts + b.stumpings) - (a.catches + a.runOuts + a.stumpings)
  );

  const allPartnerships: any[] = [];
  typeFilteredMatches.forEach((m: any) => {
    if (m.innings1) {
      getPartnerships(m.innings1, m.team1Players).forEach((p: any) =>
        allPartnerships.push({ ...p, teamName: m.team1, opponent: m.team2, date: m.matchDate })
      );
    }
  });
  const topPartnerships = [...allPartnerships].sort((a, b) => b.runs - a.runs).slice(0, 5);

  const StatRow = ({ label, value, highlight }: any) => (
    <View style={s.statRow}>
      <Text style={s.statLbl}>{label}</Text>
      <Text style={[s.statVal, highlight && { color: COLORS.primary, fontWeight: '700' }]}>{value ?? '-'}</Text>
    </View>
  );

  const ScoreStrip = ({ scores }: { scores: number[] }) => {
    if (!scores || scores.length === 0) return null;
    const recent = scores.slice(-8);
    return (
      <View style={s.scoreStrip}>
        {recent.map((v, i) => (
          <View key={i} style={[
            s.scoreDot,
            v >= 50 && { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
            v >= 100 && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
          ]}>
            <Text style={[s.scoreDotTxt, v >= 50 && { color: '#000' }]}>{v}</Text>
          </View>
        ))}
      </View>
    );
  };

  const TABS = [
    { key: 'overview', label: 'Matches',  icon: '??' },
    { key: 'batting',  label: 'Batting',  icon: '??' },
    { key: 'bowling',  label: 'Bowling',  icon: '??' },
    { key: 'fielding', label: 'Fielding', icon: '??' },
  ];

  const COUNTERS = [
    { n: typeFilteredMatches.length, l: 'Total', f: 'all' },
    { n: typeFilteredMatches.filter((m: any) => m.status === 'completed').length, l: 'Done', f: 'completed' },
   ];

  const filteredMatches = filter === 'all'
    ? typeFilteredMatches
    : typeFilteredMatches.filter((m: any) => m.status === filter);

  const battingEntries = Object.entries(batMap).map(([id, bs]: any) => {
    const avg = bs.outs > 0 ? bs.runs / bs.outs : bs.runs;
    const sr = bs.balls > 0 ? (bs.runs / bs.balls) * 100 : 0;
    return [id, bs, avg, sr];
  }).sort((x: any, y: any) => {
    if (batSort === 'avg') return y[2] - x[2];
    if (batSort === 'sr') return y[3] - x[3];
    return y[1].runs - x[1].runs;
  });

  const bowlingEntries = Object.entries(bolMap).map(([id, bw]: any) => {
    const totalOv = (bw.overs ?? 0) + (bw.balls ?? 0) / 6;
    const eco = totalOv > 0 ? bw.runs / totalOv : 999;
    const bowlAvg = (bw.wickets ?? 0) > 0 ? bw.runs / bw.wickets : 999;
    return [id, bw, eco, bowlAvg];
  }).sort((x: any, y: any) => {
    if (bolSort === 'eco') return x[2] - y[2];
    if (bolSort === 'bowlAvg') return x[3] - y[3];
    return y[1].wickets - x[1].wickets;
  });

  const SortChip = ({ label, active, onPress }: any) => (
    <TouchableOpacity style={[s.sortChip, active && s.sortChipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.sortChipTxt, active && s.sortChipTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const SectionHeader = ({ title, subtitle }: any) => (
    <View style={s.sectionHeader}>
      <Text style={s.sectionHeaderTitle}>{title}</Text>
      {subtitle ? <Text style={s.sectionHeaderSub}>{subtitle}</Text> : null}
    </View>
  );

  return (
    <View style={s.container}>
      <Header title="Match History" onBack={() => navigation.goBack()} rightText="Teams" onRight={() => navigation.navigate('MyTeams')} />

      <View style={s.filterBlock}>
  <View style={s.filterScrollRow}>
    {COUNTERS.map((x: any, i: number) => (
      <TouchableOpacity key={i} style={[s.filterChip, filter === x.f && s.filterChipActive]} onPress={() => setFilter(x.f)} activeOpacity={0.7}>
        <Text style={[s.filterChipTxt, filter === x.f && s.filterChipTxtActive]}>{x.l} <Text style={s.filterChipCount}>{x.n}</Text></Text>
      </TouchableOpacity>
    ))}
  </View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.filterScrollRow, { marginTop: 8 }]}>
    {(['all','tournament','normal'] as const).map(tf => (
      <TouchableOpacity key={tf} style={[s.filterChip, matchTypeFilter === tf && s.filterChipActive]} onPress={() => setMatchTypeFilter(tf)} activeOpacity={0.7}>
        <Text style={[s.filterChipTxt, matchTypeFilter === tf && s.filterChipTxtActive]}>
          {tf === 'all' ? 'All Types' : tf === 'tournament' ? 'Tournament' : 'Normal'}
        </Text>
      </TouchableOpacity>
    ))}
    <View style={s.filterDivider} />
    {([['all','All Time'],['30','30 Days'],['90','90 Days']] as const).map(([k, l]) => (
      <TouchableOpacity key={k} style={[s.filterChip, dateFilter === k && s.filterChipActive]} onPress={() => setDateFilter(k as DateFilter)} activeOpacity={0.7}>
        <Text style={[s.filterChipTxt, dateFilter === k && s.filterChipTxtActive]}>{l}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
</View>

      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabActive]} onPress={() => setTab(t.key as any)} activeOpacity={0.7}>
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {tab === 'overview' && (
          <View>
            


            {topPartnerships.length > 0 && (
              <View style={s.partnershipsBox}>
                <SectionHeader title="Best Partnerships" subtitle="Highest run-scoring pairs" />
                {topPartnerships.map((p: any, i: number) => (
                  <View key={i} style={[s.partnershipRow, i === topPartnerships.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[s.partnershipRank, i === 0 && s.partnershipRankGold]}>
                      <Text style={[s.partnershipRankTxt, i === 0 && { color: '#000' }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.partnershipNames}>{p.names}</Text>
                      <Text style={s.partnershipSub}>vs {p.opponent}{p.date ? ' � ' + p.date : ''}</Text>
                    </View>
                    <Text style={s.partnershipRuns}>{p.runs}{p.unbeaten ? '*' : ''} <Text style={s.partnershipBalls}>({p.balls})</Text></Text>
                  </View>
                ))}
              </View>
            )}

            {filteredMatches.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>??</Text>
                <Text style={s.emptyTxt}>{filter === 'all' ? 'No matches yet' : 'No ' + filter + ' matches'}</Text>
                <Text style={s.emptySub}>Start a new match to see it appear here.</Text>
                {filter === 'all' && (
                  <TouchableOpacity style={s.startBtn} onPress={() => navigation.navigate('NewMatch')} activeOpacity={0.85}>
                    <Text style={s.startBtnTxt}>+ Start New Match</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={s.matchList}>
                <SectionHeader title={filter === 'all' ? 'All Matches' : (COUNTERS.find(c => c.f === filter)?.l ?? '') + ' Matches'} subtitle={filteredMatches.length + ' match' + (filteredMatches.length !== 1 ? 'es' : '')} />
                {filteredMatches.map((m: any, i: number) => (
                  <TouchableOpacity key={m.id ?? i} style={s.matchCard} activeOpacity={0.85}
                    onPress={() => m.status === 'live' ? navigation.navigate('Scoring', { matchId: m.id }) : navigation.navigate('Scorecard', { matchId: m.id })}>
                    <View style={s.mCardTop}>
                      <Text style={s.mDate}>{m.matchDate ?? ''}</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {m.tournamentId ? (
                          <View style={[s.mBadge, { backgroundColor: COLORS.yellow + '33', borderColor: COLORS.yellow + '55' }]}>
                            <Text style={[s.mBadgeTxt, { color: COLORS.yellow }]}>?? Tournament</Text>
                          </View>
                        ) : null}
                        <View style={[s.mBadge, m.status === 'live' ? s.mBadgeLive : m.status === 'paused' ? s.mBadgePaused : s.mBadgeDone]}>
                          <Text style={[s.mBadgeTxt, m.status === 'live' && { color: COLORS.red }, m.status === 'paused' && { color: COLORS.orange }, m.status === 'completed' && { color: COLORS.primary }]}>
                            {m.status === 'live' ? '? Live' : m.status === 'paused' ? '? Paused' : '? Done'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text style={s.mTeams}>{m.team1} <Text style={s.mVsInline}>vs</Text> {m.team2}</Text>
                    {m.venue ? <Text style={s.mVenue}>?? {m.venue}</Text> : null}

                    <View style={s.mScoresBlock}>
                      <View style={s.mScoreRow}>
                        <Text style={s.mTeamName} numberOfLines={1}>{m.team1}</Text>
                        <Text style={s.mScore}>{m.innings1?.runs ?? 0}/{m.innings1?.wickets ?? 0} <Text style={s.mScoreOvers}>({m.innings1?.overs ?? 0}.{m.innings1?.balls ?? 0})</Text></Text>
                      </View>
                      <View style={s.mScoreDivider} />
                      <View style={s.mScoreRow}>
                        <Text style={s.mTeamName} numberOfLines={1}>{m.team2}</Text>
                        <Text style={s.mScore}>{m.innings2?.runs ?? 0}/{m.innings2?.wickets ?? 0} <Text style={s.mScoreOvers}>({m.innings2?.overs ?? 0}.{m.innings2?.balls ?? 0})</Text></Text>
                      </View>
                    </View>

                    {m.winner ? (
                      <View style={s.mWinnerBanner}>
                        <Text style={s.mWinnerTxt}>?? {m.winner}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === 'batting' && (
          <View style={s.statsArea}>
            {Object.keys(batMap).length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>??</Text>
                <Text style={s.emptyTxt}>No batting stats yet</Text>
                <Text style={s.emptySub}>Stats appear here after you score matches where your team bats first (team1)</Text>
              </View>
            ) : (
              <>
                <SectionHeader title="Batting Stats" subtitle={Object.keys(batMap).length + ' player' + (Object.keys(batMap).length !== 1 ? 's' : '')} />
                <View style={s.sortRow}>
                  <SortChip label="Runs" active={batSort === 'runs'} onPress={() => setBatSort('runs')} />
                  <SortChip label="Average" active={batSort === 'avg'} onPress={() => setBatSort('avg')} />
                  <SortChip label="Strike Rate" active={batSort === 'sr'} onPress={() => setBatSort('sr')} />
                </View>
                {battingEntries.map(([id, bs, avgN, srN]: any) => {
                  const avg = bs.outs > 0 ? avgN.toFixed(1) : bs.runs > 0 ? bs.runs + '*' : '0';
                  const sr = srN.toFixed(1);
                  const hs = bs.scores.length > 0 ? Math.max(...bs.scores) : 0;
                  const fifties  = bs.scores.filter((x: number) => x >= 50 && x < 100).length;
                  const hundreds = bs.scores.filter((x: number) => x >= 100).length;
                  return (
                    <View key={id} style={s.pCard}>
                      <View style={s.pCardHead}>
                        <View style={s.pAvatar}>
                          <Text style={s.pAvatarTxt}>{(bs.name ?? 'P').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.pName}>{bs.name}</Text>
                          <Text style={s.pSub}>{bs.innings} innings played</Text>
                        </View>
                        <View style={s.pHighlight}>
                          <Text style={s.pHNum}>{bs.runs}</Text>
                          <Text style={s.pHLbl}>RUNS</Text>
                        </View>
                      </View>
                      <ScoreStrip scores={bs.scores} />
                      <View style={s.statGrid}>
                        <StatRow label="Balls Faced"   value={bs.balls} />
                        <StatRow label="4s"            value={bs.fours} />
                        <StatRow label="6s"            value={bs.sixes} />
                        <StatRow label="Strike Rate"   value={sr}  highlight={batSort === 'sr'} />
                        <StatRow label="Average"       value={avg} highlight={batSort === 'avg'} />
                        <StatRow label="Highest Score" value={hs}  highlight />
                        <StatRow label="50s"           value={fifties} />
                        <StatRow label="100s"          value={hundreds} />
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {tab === 'bowling' && (
          <View style={s.statsArea}>
            {Object.keys(bolMap).length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>??</Text>
                <Text style={s.emptyTxt}>No bowling stats yet</Text>
                <Text style={s.emptySub}>Stats appear after your team bowls in the 2nd innings</Text>
              </View>
            ) : (
              <>
                <SectionHeader title="Bowling Stats" subtitle={Object.keys(bolMap).length + ' player' + (Object.keys(bolMap).length !== 1 ? 's' : '')} />
                <View style={s.sortRow}>
                  <SortChip label="Wickets" active={bolSort === 'wickets'} onPress={() => setBolSort('wickets')} />
                  <SortChip label="Economy" active={bolSort === 'eco'} onPress={() => setBolSort('eco')} />
                  <SortChip label="Average" active={bolSort === 'bowlAvg'} onPress={() => setBolSort('bowlAvg')} />
                </View>
                {bowlingEntries.map(([id, bw, ecoN, bowlAvgN]: any) => {
                  const eco = ecoN < 999 ? ecoN.toFixed(2) : '0.00';
                  const totalBalls = (bw.overs ?? 0) * 6 + (bw.balls ?? 0);
                  const bowlSR  = (bw.wickets ?? 0) > 0 ? (totalBalls / bw.wickets).toFixed(1) : '-';
                  const bowlAvg = bowlAvgN < 999 ? bowlAvgN.toFixed(1) : '-';
                  const figs    = bw.figures ?? [];
                  const bbf     = figs.length > 0 ? [...figs].sort((a: any, b: any) => b.w - a.w || a.r - b.r)[0] : null;
                  return (
                    <View key={id} style={s.pCard}>
                      <View style={s.pCardHead}>
                        <View style={[s.pAvatar, { backgroundColor: COLORS.red }]}>
                          <Text style={s.pAvatarTxt}>{(bw.name ?? 'P').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.pName}>{bw.name}</Text>
                          <Text style={s.pSub}>{bw.innings} innings bowled</Text>
                        </View>
                        <View style={[s.pHighlight, { backgroundColor: COLORS.red + '1a', borderColor: COLORS.red }]}>
                          <Text style={[s.pHNum, { color: COLORS.red }]}>{bw.wickets ?? 0}</Text>
                          <Text style={s.pHLbl}>WKTS</Text>
                        </View>
                      </View>
                      <View style={s.statGrid}>
                        <StatRow label="Overs"           value={(bw.overs ?? 0) + '.' + (bw.balls ?? 0)} />
                        <StatRow label="Runs Conceded"   value={bw.runs ?? 0} />
                        <StatRow label="Economy"         value={eco}    highlight={bolSort === 'eco'} />
                        <StatRow label="Bowling SR"      value={bowlSR} highlight />
                        <StatRow label="Average"         value={bowlAvg} highlight={bolSort === 'bowlAvg'} />
                        <StatRow label="Wides"           value={bw.wides ?? 0} />
                        <StatRow label="No Balls"        value={bw.noBalls ?? 0} />
                        <StatRow label="Best Bowling"    value={bbf ? bbf.w + '/' + bbf.r : '-'} highlight />
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {tab === 'fielding' && (
          <View style={s.statsArea}>
            <SectionHeader title="Fielding Overview" />
            <View style={s.fieldSummary}>
              {[
                { icon: '??', label: 'Catches',   value: fieldTotals.catches,   color: COLORS.blue },
                { icon: '??', label: 'Run Outs',  value: fieldTotals.runOuts,   color: COLORS.orange },
                { icon: '??', label: 'Stumpings', value: fieldTotals.stumpings, color: COLORS.purple },
                { icon: '??', label: 'Matches',   value: typeFilteredMatches.length, color: COLORS.primary },
              ].map((f, i) => (
                <View key={i} style={[s.fieldingBox, { borderColor: f.color + '55' }]}>
                  <View style={[s.fieldingIcon, { backgroundColor: f.color + '22' }]}>
                    <Text style={s.fieldingIconTxt}>{f.icon}</Text>
                  </View>
                  <Text style={[s.fieldingVal, { color: f.color }]}>{f.value}</Text>
                  <Text style={s.fieldingLbl}>{f.label}</Text>
                </View>
              ))}
            </View>

            {fieldRows.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>??</Text>
                <Text style={s.emptyTxt}>No fielding stats yet</Text>
                <Text style={s.emptySub}>
                  Fielding stats are recorded when you select a fielder during Caught, Stumped, or Run Out dismissals while scoring.
                </Text>
              </View>
            ) : (
              <>
                <SectionHeader title="By Player" subtitle={fieldRows.length + ' player' + (fieldRows.length !== 1 ? 's' : '')} />
                {(fieldRows as any[]).map((f: any, i: number) => {
                  const total = (f.catches ?? 0) + (f.runOuts ?? 0) + (f.stumpings ?? 0);
                  return (
                    <View key={f.name ?? i} style={s.pCard}>
                      <View style={s.pCardHead}>
                        <View style={[s.pAvatar, { backgroundColor: COLORS.teal }]}>
                          <Text style={s.pAvatarTxt}>{(f.name ?? 'F').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.pName}>{f.name}</Text>
                        </View>
                        <View style={[s.pHighlight, { backgroundColor: COLORS.teal + '1a', borderColor: COLORS.teal }]}>
                          <Text style={[s.pHNum, { color: COLORS.teal }]}>{total}</Text>
                          <Text style={s.pHLbl}>TOTAL</Text>
                        </View>
                      </View>
                      <View style={s.statGrid}>
                        <StatRow label="Catches"   value={f.catches   ?? 0} highlight={f.catches   > 0} />
                        <StatRow label="Run Outs"  value={f.runOuts   ?? 0} highlight={f.runOuts   > 0} />
                        <StatRow label="Stumpings" value={f.stumpings ?? 0} highlight={f.stumpings > 0} />
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, gap: 12 },
  loadingTxt: { color: COLORS.textSecondary, fontSize: 13 },

  filterBlock: { paddingTop: 10, paddingBottom: 8 },
  filterScrollRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.lg, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.round, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipTxt: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  filterChipTxtActive: { color: '#fff' },
  filterChipCount: { fontSize: 11, opacity: 0.7 },
  filterDivider: { width: 1, height: 22, backgroundColor: COLORS.border, marginHorizontal: 2 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, marginTop: 6 },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', gap: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabIcon: { fontSize: 15 },
  tabTxt: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  tabTxtActive: { color: COLORS.primary },

  scroll: { flex: 1 },

  sectionHeader: { paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: 10 },
  sectionHeaderTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  sectionHeaderSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },

  formCard: { marginHorizontal: SPACING.lg, marginTop: SPACING.lg, backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  formLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  formRow: { flexDirection: 'row', gap: 9 },
  formPill: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center' },
  formPillTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },


  partnershipsBox: { marginHorizontal: SPACING.lg, marginTop: SPACING.lg, backgroundColor: COLORS.card, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  partnershipRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  partnershipRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  partnershipRankGold: { backgroundColor: COLORS.yellow },
  partnershipRankTxt: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '800' },
  partnershipNames: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  partnershipSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  partnershipRuns: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  partnershipBalls: { color: COLORS.textMuted, fontSize: 11, fontWeight: '400' },

  matchList: { paddingBottom: 10 },
  matchCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, marginHorizontal: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  mCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  mDate: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  mBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: RADIUS.round, borderWidth: 1, borderColor: 'transparent' },
  mBadgeLive: { backgroundColor: COLORS.red + '22', borderColor: COLORS.red + '55' },
  mBadgeDone: { backgroundColor: COLORS.primary + '1a', borderColor: COLORS.primary + '44' },
  mBadgePaused: { backgroundColor: COLORS.orange + '22', borderColor: COLORS.orange + '55' },
  mBadgeTxt: { color: COLORS.text, fontSize: 10, fontWeight: '800' },
  mTeams: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: 3 },
  mVsInline: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },
  mVenue: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 12 },
  mScoresBlock: { backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 10 },
  mScoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  mTeamName: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  mScore: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  mScoreOvers: { color: COLORS.textMuted, fontSize: 11, fontWeight: '500' },
  mScoreDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 2 },
  mWinnerBanner: { marginTop: 10, backgroundColor: COLORS.yellow + '18', borderRadius: RADIUS.sm, paddingVertical: 7, paddingHorizontal: 10 },
  mWinnerTxt: { color: COLORS.yellow, fontSize: 12, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: SPACING.xl },
  emptyIcon: { fontSize: 40, marginBottom: 10, opacity: 0.6 },
  emptyTxt: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptySub: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  startBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 26, paddingVertical: 13, borderRadius: RADIUS.round, marginTop: 16 },
  startBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  statsArea: { paddingBottom: SPACING.lg, gap: 14 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.lg, marginBottom: 2 },
  sortChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border },
  sortChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortChipTxt: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  sortChipTxtActive: { color: '#fff' },

  pCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginHorizontal: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  pCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  pAvatarTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  pName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  pSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  pHighlight: { backgroundColor: COLORS.primary + '1a', borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary, minWidth: 58 },
  pHNum: { color: COLORS.primary, fontSize: 20, fontWeight: '800' },
  pHLbl: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  scoreStrip: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  scoreDot: { minWidth: 28, height: 24, borderRadius: RADIUS.sm, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: COLORS.border },
  scoreDotTxt: { color: COLORS.text, fontSize: 10, fontWeight: '700' },

  statGrid: { gap: 0 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  statLbl: { color: COLORS.textSecondary, fontSize: 13 },
  statVal: { color: COLORS.text, fontSize: 13, fontWeight: '600' },

  fieldSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: SPACING.lg, marginBottom: 4 },
  fieldingBox: { width: '46%', backgroundColor: COLORS.card2, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1 },
  fieldingIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginBottom: 9 },
  fieldingIconTxt: { fontSize: 20 },
  fieldingVal: { fontSize: 28, fontWeight: '800' },
  fieldingLbl: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4, fontWeight: '600' },
});