import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getMyLinkedPlayerId, getMatchesForPlayer, getPlayerPublicProfile } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW, GRADIENTS } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';
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
          const [m, profile] = await Promise.all([getMatchesForPlayer(pid), getPlayerPublicProfile(pid)]);
          setMatches(m ?? []);
          // Live name from the player's own record, not whatever was frozen
          // into an old match's roster — so a post-registration name change
          // (or a guest name) shows up correctly here immediately.
          if (profile?.name) setMyName(profile.name);
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
        <View style={s.adBar}>
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

  const StatRow = ({ label, value, highlight, index }: any) => (
    <View style={[
      s.statRow,
      typeof index === 'number' && index % 2 === 1 && s.statRowAlt,
      highlight && s.statRowHighlight,
    ]}>
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
        {/* Two overlapping tinted circles fake a gradient glow behind the
            avatar — same trick used on the Home screen's featured CTA, no
            gradient library. Absolute + pointerEvents none, so it cannot
            affect the row's layout or hit testing. */}
        <View pointerEvents="none" style={[s.bannerBlob, { backgroundColor: GRADIENTS.violet[0], left: -20, top: -30 }]} />
        <View pointerEvents="none" style={[s.bannerBlob, { backgroundColor: GRADIENTS.violet[1], left: 30, bottom: -36 }]} />
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
            const isPlayerTeam1 = (m.team1Players ?? []).some((p: any) => p.globalPlayerId === myPlayerId);
            // Structured result first; the sentence is only a legacy fallback.
            const r = m.result;
            if (r) {
              if (r.resultType === 'NO_RESULT' || r.resultType === 'ABANDONED') return null;
              if (r.resultType === 'TIE') return 'T';
              // A Super Over decides who progressed, so it reads as a W or an L.
              if (r.winnerTeam) return r.winnerTeam === (isPlayerTeam1 ? m.team1 : m.team2) ? 'W' : 'L';
              return null;
            }
            const w = m.winner ?? '';
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
            <View pointerEvents="none" style={s.cardEdge} />
            <View pointerEvents="none" style={[s.bannerBlob, s.formBlob, { backgroundColor: GRADIENTS.berry[0], right: -24, top: -28 }]} />
            <View pointerEvents="none" style={[s.bannerBlob, s.formBlob, { backgroundColor: GRADIENTS.berry[1], right: 36, bottom: -30 }]} />
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
                <View pointerEvents="none" style={s.cardEdge} />
                <View style={s.pCardHead}>
                  <View style={[s.pAvatar, SHADOW.glow(COLORS.primary)]}>
                    <Text style={s.pAvatarTxt}>{(myName || 'M').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pName}>{myName || 'Me'}</Text>
                    <Text style={s.pSub}>{batAgg.innings} innings</Text>
                  </View>
                  <View style={s.pHighlight}>
                    <View pointerEvents="none" style={[s.pHighlightTint, { backgroundColor: COLORS.primary }]} />
                    <Text style={s.pHNum}>{batAgg.runs}</Text>
                    <Text style={s.pHLbl}>RUNS</Text>
                  </View>
                </View>
                <StatRow label="Balls Faced"   value={batAgg.balls} index={0} />
                <StatRow label="4s"            value={batAgg.fours} index={1} />
                <StatRow label="6s"            value={batAgg.sixes} index={2} />
                <StatRow label="Strike Rate"   value={sr}  highlight index={3} />
                <StatRow label="Average"       value={avg} highlight index={4} />
                <StatRow label="Highest Score" value={hs}  highlight index={5} />
                <StatRow label="50s"           value={fifties} index={6} />
                <StatRow label="100s"          value={hundreds} index={7} />
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
                <View pointerEvents="none" style={s.cardEdge} />
                <View style={s.pCardHead}>
                  <View style={[s.pAvatar, { backgroundColor: COLORS.red }, SHADOW.glow(COLORS.red)]}>
                    <Text style={s.pAvatarTxt}>{(myName || 'M').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pName}>{myName || 'Me'}</Text>
                    <Text style={s.pSub}>{bolAgg.innings} innings</Text>
                  </View>
                  <View style={[s.pHighlight, { backgroundColor: COLORS.red + '22', borderColor: COLORS.red }]}>
                    <View pointerEvents="none" style={[s.pHighlightTint, { backgroundColor: COLORS.red }]} />
                    <Text style={[s.pHNum, { color: COLORS.red }]}>{bolAgg.wickets}</Text>
                    <Text style={s.pHLbl}>WKTS</Text>
                  </View>
                </View>
                <StatRow label="Overs"         value={bolAgg.overs + '.' + bolAgg.balls} index={0} />
                <StatRow label="Runs Conceded" value={bolAgg.runs} index={1} />
                <StatRow label="Economy"       value={eco} highlight index={2} />
                <StatRow label="Best Bowling"  value={bbf ? bbf.w + '/' + bbf.r : '-'} highlight index={3} />
                <StatRow label="Wides"         value={bolAgg.wides} index={4} />
                <StatRow label="No Balls"      value={bolAgg.noBalls} index={5} />
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
                <View key={i} style={[s.fieldBox, { borderColor: f.color + '55' }, SHADOW.glow(f.color)]}>
                  <View pointerEvents="none" style={s.cardEdge} />
                  <View pointerEvents="none" style={[s.fieldTint, { backgroundColor: f.color }]} />
                  <View style={[s.fieldIcon, { backgroundColor: f.color + '22' }]}>
                    <AppIcon emoji={f.icon} size={20} color={f.color} />
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
      <View style={s.adBar}>
        <AdBanner />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  // Shared 1px lit top edge, reused by every card on this screen. Cheaper than
  // a full border and it is what makes a dark surface read as raised.
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  adBar: { paddingHorizontal: SPACING.lg, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft },

  // ── Identity banner ──
  // Ringed avatar with a soft glow, matching the Home screen, so the two
  // screens read as the same product.
  profileBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft, overflow: 'hidden' },
  // Decorative gradient-fake blobs — absolute + clipped by the banner's own
  // overflow:hidden, so they can only ever sit behind the avatar/text, never
  // shift them.
  bannerBlob: { position: 'absolute', width: 100, height: 100, borderRadius: 50, opacity: 0.16 },
  formBlob: { width: 90, height: 90, borderRadius: 45, opacity: 0.14 },
  profileAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  profileAvatarTxt: { ...TYPE.h2, color: COLORS.primary },
  profileName: { ...TYPE.title, color: COLORS.text },
  profileSub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 2 },

  // ── Recent form strip ──
  formCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.xl, padding: 14, margin: SPACING.lg, marginBottom: 0, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden', ...SHADOW.md },
  formLabel: { ...TYPE.label, color: COLORS.textMuted, marginBottom: 10 },
  formRow: { flexDirection: 'row', gap: 9 },
  formPill: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.borderSoft, justifyContent: 'center', alignItems: 'center', ...SHADOW.sm },
  formPillTxt: { ...TYPE.bodyStrong, fontSize: 13, color: '#fff' },

  // ── Tabs ──
  // Hairline base + a 2px primary underline on the active tab: the underline is
  // the only strong line, so it is unmistakable which tab is selected.
  tabs: { flexDirection: 'row', gap: 4, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, backgroundColor: COLORS.card, borderRadius: RADIUS.round, padding: 4, borderWidth: 1, borderColor: COLORS.borderSoft },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: RADIUS.round },
  tabActive: { backgroundColor: COLORS.primary },
  tabTxt: { ...TYPE.label, color: COLORS.textSecondary },
  tabTxtActive: { color: COLORS.onPrimary },

  scroll: { flex: 1 },
  statsArea: { padding: SPACING.lg, gap: 14 },

  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: SPACING.xl },
  emptyTxt: { ...TYPE.title, color: COLORS.text, marginBottom: SPACING.sm, textAlign: 'center' },
  emptySub: { ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.md },
  startBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 26, paddingVertical: 13, borderRadius: RADIUS.round, ...SHADOW.glow(COLORS.primary) },
  startBtnTxt: { ...TYPE.button, color: COLORS.onPrimary },

  // ── Player stat card ──
  pCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden', ...SHADOW.md },
  pCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.sm, paddingBottom: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  pAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...SHADOW.sm },
  pAvatarTxt: { ...TYPE.title, color: '#fff' },
  pName: { ...TYPE.title, fontSize: 15, color: COLORS.text },
  pSub: { ...TYPE.caption, fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  // The headline figure (runs / wickets) is the single biggest thing in the
  // card, in tabular figures so it never shifts width.
  pHighlight: { backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary + '55', minWidth: 62, overflow: 'hidden' },
  // Soft tint circle behind the headline figure, same technique as the shared
  // StatCard component's `color` tint — decorative only.
  pHighlightTint: { position: 'absolute', top: -22, right: -22, width: 64, height: 64, borderRadius: 32, opacity: 0.16 },
  pHNum: { ...TYPE.displaySm, fontSize: 24, color: COLORS.primary },
  pHLbl: { ...TYPE.label, fontSize: 9, color: COLORS.textMuted, marginTop: 1 },

  // ── Stat rows ──
  // Label left in uppercase tracking, figure right in tabular numerals, so the
  // values form a clean right-hand column instead of ragged text.
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  // Zebra tint and a soft highlight tint — background-only, so a dense stat
  // list reads as scannable rows without touching row height or column
  // alignment.
  statRowAlt: { backgroundColor: COLORS.card2 },
  statRowHighlight: { backgroundColor: COLORS.primarySoft },
  statLbl: { ...TYPE.colLabel, color: COLORS.textMuted },
  statVal: { ...TYPE.num, color: COLORS.text, textAlign: 'right' },

  // ── Fielding summary grid ──
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldBox: { width: '46%', backgroundColor: COLORS.card, borderRadius: RADIUS.xl, padding: 16, alignItems: 'center', borderWidth: 1, overflow: 'hidden', ...SHADOW.sm },
  // Soft tint circle behind the icon, same technique as StatCard's `color`
  // tint — decorative only, the icon/value/label are unchanged.
  fieldTint: { position: 'absolute', top: -26, right: -26, width: 84, height: 84, borderRadius: 42, opacity: 0.16 },
  fieldIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  fieldIconTxt: { fontSize: 20 },
  fieldVal: { ...TYPE.displaySm, fontSize: 26 },
  fieldLbl: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary, marginTop: 4 },
});
