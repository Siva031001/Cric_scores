import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, ScrollView, Image, StatusBar, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { signInAnonymously, getCurrentUser, subscribeToProfile, getUserProfile, getMyTeams, getMatchHistory, getTournamentsVersion, canManageMatch } from '../../utils/firebase';
import { AdBanner } from '../../components/AdPlaceholder';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import { getPublicTournaments, searchPublicTournaments, getHomePageTournaments, getTournamentDisplayStatus } from '../../utils/firebase';
import LiveTournamentCarousel from '../../components/LiveTournamentCarousel';
import AppIcon from '../../components/AppIcon';
import Badge from '../../components/Badge';

export default function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [publicTournaments, setPublicTournaments] = useState<any[]>([]);
  const [tournamentFilter, setTournamentFilter] = useState<'all'|'live'|'upcoming'|'completed'|'mine'>('all');

  // getPublicTournaments() reads the WHOLE tournaments node (each tournament
  // carries its teams, rosters, pools, fixtures and matches). Measured against
  // real data it is ~117 KB / 0.4s, so it is not the cause of any large delay —
  // but a bare useFocusEffect re-ran it on every single return to this screen,
  // which is needless repeated work on mobile data. Throttled, plus a version
  // check so edits still appear at once.
  const tournamentsFetchedAtRef = useRef(0);
  const tournamentsVersionRef = useRef(-1);
  const TOURNAMENTS_TTL_MS = 60 * 1000;
  useFocusEffect(useCallback(() => {
    // Refetch when the throttle window has passed OR when any tournament was
    // written since the last fetch. The version check is what makes an edit to
    // the Start/End dates show up here immediately — those dates decide the
    // Upcoming/Live/Completed badge, so waiting out the throttle would leave
    // the dashboard showing a status the user just changed.
    const version = getTournamentsVersion();
    const stale = Date.now() - tournamentsFetchedAtRef.current >= TOURNAMENTS_TTL_MS;
    if (!stale && version === tournamentsVersionRef.current) return;
    tournamentsFetchedAtRef.current = Date.now();
    tournamentsVersionRef.current = version;
    getPublicTournaments()
      .then(setPublicTournaments)
      .catch(() => {
        // Allow an immediate retry on the next focus rather than caching the failure.
        tournamentsFetchedAtRef.current = 0;
        tournamentsVersionRef.current = -1;
        setPublicTournaments([]);
      });
  }, []));

  const openLiveMatch = async (m: any) => {
    const allowed = await canManageMatch(m);
    navigation.navigate(allowed ? 'Scoring' : 'Scorecard', { matchId: m.id });
  };

  const loadData = useCallback(async () => {
    try {
      const [t, m, p] = await Promise.all([getMyTeams(), getMatchHistory(), getUserProfile()]);
      setTeams(t ?? []);
      setMatches(m ?? []);
      setLiveMatches((m ?? []).filter((x: any) => x.status === 'live' || x.status === 'paused'));
      if (p) setProfile(p);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        if (!getCurrentUser()) await signInAnonymously();
        await loadData();
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    const unsub = subscribeToProfile((data: any) => { if (data) setProfile(data); });
    return unsub;
  }, []);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (!text.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const q = text.toLowerCase();
    const results: any[] = [];
    teams.forEach((team: any) => {
      if (team.name?.toLowerCase().includes(q)) results.push({ type: 'team', data: team });
    });
    matches.forEach((match: any) => {
      if (match.team1?.toLowerCase().includes(q) || match.team2?.toLowerCase().includes(q) || (match.venue ?? '').toLowerCase().includes(q))
        results.push({ type: 'match', data: match });
    });
    // Tournaments are included here too, since the search results view
    // below replaces the whole home screen (including the tournament
    // carousel) while searching - without this, tournament search would
    // find nothing even when matching tournaments exist.
    publicTournaments.forEach((t: any) => {
      if (
        (t.name ?? '').toLowerCase().includes(q) ||
        (t.organisationName ?? '').toLowerCase().includes(q) ||
        (t.venue ?? '').toLowerCase().includes(q)
      ) {
        results.push({ type: 'tournament', data: t });
      }
    });
    setSearchResults(results);
  };

  // Live Match (id:'live') REMOVED as requested
  const MENU = [
    { id: 'matches', icon: '📊', label: 'My Matches', sub: 'Stats & Overview', screen: 'MyMatches', color: COLORS.blue },
    { id: 'teams', icon: '👥', label: 'Teams', sub: 'My & Other Teams', screen: 'MyTeams', color: COLORS.teal },
    { id: 'tournament', icon: '🏆', label: 'My Tournaments', sub: 'View tournaments', screen: 'MyTournament', color: COLORS.yellow },
    { id: 'create_t', icon: '➕', label: 'Create Tournament', sub: 'Organise a tournament', screen: 'CreateTournament', color: COLORS.orange },
    { id: 'join_captain', icon: '✉️', label: 'Join as Captain', sub: 'Enter a tournament invite code', screen: 'JoinAsCaptain', color: COLORS.blue },
    { id: 'history', icon: '📋', label: 'Match History', sub: 'Detailed stats per match', screen: 'MatchHistoryDetail', color: COLORS.purple },
    { id: 'livestream', icon: '📡', label: 'YouTube Live', sub: 'Stream live match', screen: 'LiveStream', color: COLORS.red },
    { id: 'settings', icon: '⚙️', label: 'Settings', sub: 'Profile & preferences', screen: 'Settings', color: COLORS.textSecondary },
  ];

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={st.topBar}>
        <TouchableOpacity style={st.profileRow} onPress={() => navigation.navigate('ProfileEdit')}>
          <View style={st.avatar}>
            {profile?.photo ? <Image source={{ uri: profile.photo }} style={st.avatarImg} /> :
              <Text style={st.avatarText}>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'C'}</Text>}
          </View>
          <View>
            <Text style={st.greeting}>Welcome back,</Text>
            <Text style={st.profileName}>{profile?.name ?? 'Cricketer'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={st.settingsBtn} onPress={() => navigation.navigate('Settings')}>
          <AppIcon emoji="⚙️" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={st.searchBox}>
        <AppIcon emoji="🔍" size={16} color={COLORS.textSecondary} />
        <TextInput style={st.searchInput} placeholder="Search team, player, venue..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={handleSearch} />
        {search !== '' && <TouchableOpacity onPress={() => { setSearch(''); setSearchResults([]); setSearching(false); }}><AppIcon emoji="✕" size={16} color={COLORS.textSecondary} /></TouchableOpacity>}
      </View>

      {searching && (
        <View style={st.searchResultsBox}>
          {searchResults.length === 0 ? <Text style={st.noResults}>No results for "{search}"</Text> : (
            <FlatList data={searchResults} keyExtractor={(item, i) => i.toString()} style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={st.searchResultItem} onPress={() => {
                  setSearch(''); setSearching(false); setSearchResults([]);
                  if (item.type === 'team') navigation.navigate('TeamDetail', { teamId: item.data.id });
                  else if (item.type === 'tournament') navigation.navigate('TournamentDetail', { tournamentId: item.data.id, viewOnly: item.data.createdBy !== getCurrentUser()?.uid });
                  else navigation.navigate('Scorecard', { matchId: item.data.id });
                }}>
                  <AppIcon emoji={item.type === 'team' ? '👥' : item.type === 'tournament' ? '🏆' : '🏏'} size={22} color={COLORS.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.searchResultTitle}>{item.type === 'team' ? item.data.name : item.type === 'tournament' ? item.data.name : item.data.team1 + ' vs ' + item.data.team2}</Text>
                    <Text style={st.searchResultSub}>{item.type === 'team' ? (item.data.players?.length ?? 0) + ' players' : item.type === 'tournament' ? (item.data.venue ?? 'Tournament') : item.data.venue ?? 'Match'}</Text>
                  </View>
                  <Text style={st.searchResultType}>{item.type === 'team' ? 'Team' : item.type === 'tournament' ? 'Tournament' : 'Match'}</Text>
                </TouchableOpacity>
              )} />
          )}
        </View>
      )}

      {!searching && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {liveMatches.length > 0 && (
            <View style={st.liveSection}>
              <View style={st.liveHeaderRow}>
                <Badge label="Live" tone="live" />
                <Text style={st.liveSectionTitle}>Live Matches</Text>
              </View>
              {liveMatches.map((m: any) => (
                <TouchableOpacity key={m.id} style={st.liveCard} onPress={() => openLiveMatch(m)}>
                  <View style={st.liveCardTop}>
                    <Text style={st.liveTeams} numberOfLines={1}>{m.team1} vs {m.team2}</Text>
                    <Text style={st.liveContinue}>Continue →</Text>
                  </View>
                  <Text style={st.liveScore}>{m.innings1?.runs ?? 0}/{m.innings1?.wickets ?? 0}{m.currentInnings === 2 ? ' | ' + (m.innings2?.runs ?? 0) + '/' + (m.innings2?.wickets ?? 0) : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Public Tournament Discovery */}
          <View style={{ marginBottom: 16 }}>
            <View style={st.sectionRow}>
              <Text style={st.sectionTitle}>Discover Tournaments</Text>
            </View>
            <View style={st.chipRow}>
              {[
                { key: 'all', label: 'All' },
                { key: 'live', label: 'Live Now' },
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'completed', label: 'Completed' },
                { key: 'mine', label: 'My Tournaments' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setTournamentFilter(f.key as any)}
                  style={[st.chip, tournamentFilter === f.key && st.chipActive]}
                >
                  <Text style={[st.chipText, tournamentFilter === f.key && st.chipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <LiveTournamentCarousel
              tournaments={(() => {
                // Home poster carousel: Live + Upcoming only, date-derived —
                // completed tournaments never appear here automatically,
                // regardless of the stored status field. The "Completed"
                // filter chip is an explicit override for anyone who wants
                // to look back at old tournaments on purpose.
                let list = tournamentFilter === 'completed' || tournamentFilter === 'mine'
                  ? publicTournaments
                  : getHomePageTournaments(publicTournaments);

                if (tournamentFilter === 'completed') list = list.filter((t) => getTournamentDisplayStatus(t) === 'completed');
                else if (tournamentFilter === 'live') list = list.filter((t) => getTournamentDisplayStatus(t) === 'live');
                else if (tournamentFilter === 'upcoming') list = list.filter((t) => getTournamentDisplayStatus(t) === 'upcoming');
                else if (tournamentFilter === 'mine') list = list.filter((t) => t.createdBy === getCurrentUser()?.uid);

                if (search) list = searchPublicTournaments(list, search);
                return list;
              })()}
              onPress={(t) => navigation.navigate('TournamentDetail', { tournamentId: t.id, viewOnly: t.createdBy !== getCurrentUser()?.uid })}
            />
          </View>

          <TouchableOpacity style={st.featuredBtn} onPress={() => navigation.navigate('NewMatch')}>
            <View style={st.featuredLeft}>
              <AppIcon emoji="🏏" size={32} color="#fff" />
            <View>
              <Text style={st.featuredTitle}>Start New Match</Text>
              <Text style={st.featuredSub}>Score and track live</Text>
            </View>
          </View>
              <AppIcon emoji="→" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={st.grid}>
            {MENU.map(item => (
              <TouchableOpacity key={item.id} style={st.menuCard} onPress={() => navigation.navigate(item.screen)}>
                <View pointerEvents="none" style={st.menuEdge} />
                <View style={[st.iconBox, { backgroundColor: item.color + '22' }]}>
                  <AppIcon emoji={item.icon} size={22} color={item.color} />
                </View>
                <Text style={st.menuLabel}>{item.label}</Text>
                <Text style={st.menuSub}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
      <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}>
        <AdBanner />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: 55, paddingBottom: SPACING.md },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Ring gap between border and image reads as a deliberate avatar frame
  // rather than a cropped square.
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { ...TYPE.h2, color: COLORS.primary },
  greeting: { ...TYPE.caption, color: COLORS.textSecondary },
  profileName: { ...TYPE.title, color: COLORS.text, marginTop: 1 },
  settingsIcon: { fontSize: 24 },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, borderRadius: RADIUS.round, paddingHorizontal: SPACING.md, paddingVertical: 12, marginBottom: SPACING.xs, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm, ...SHADOW.sm },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, ...TYPE.body, color: COLORS.text, padding: 0 },
  clearBtn: { color: COLORS.textSecondary, fontSize: 16 },
  searchResultsBox: { backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xs, borderWidth: 1, borderColor: COLORS.border, maxHeight: 350, overflow: 'hidden', ...SHADOW.lg },
  noResults: { ...TYPE.body, color: COLORS.textSecondary, padding: SPACING.lg, textAlign: 'center' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  searchResultIcon: { fontSize: 22 },
  searchResultTitle: { ...TYPE.bodyStrong, color: COLORS.text },
  searchResultSub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 2 },
  searchResultType: { ...TYPE.label, fontSize: 9, color: COLORS.primary, backgroundColor: COLORS.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.round, overflow: 'hidden' },

  // ── Live section ──
  // Given the strongest treatment on the screen: it is the one thing a scorer
  // opens the app to reach.
  liveSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, marginTop: SPACING.md },
  liveHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  liveSectionTitle: { ...TYPE.label, color: COLORS.live },
  liveCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.live + '44', borderLeftWidth: 3, borderLeftColor: COLORS.live, marginBottom: SPACING.sm, ...SHADOW.md },
  liveCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  liveTeams: { ...TYPE.title, color: COLORS.text },
  // The score is the largest thing in the card, with tabular figures so it
  // does not shift as runs tick over.
  liveScore: { ...TYPE.displaySm, color: COLORS.primaryLight, marginTop: 2 },
  liveContinue: { ...TYPE.caption, color: COLORS.textSecondary },

  // ── Filter chips ──
  chipRow: { flexDirection: 'row', gap: 6, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.onPrimary },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  sectionTitle: { ...TYPE.h2, color: COLORS.text },

  // ── Primary call to action ──
  featuredBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, padding: 18, marginBottom: SPACING.lg, marginTop: SPACING.sm, ...SHADOW.glow(COLORS.primary) },
  featuredLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featuredIcon: { fontSize: 32 },
  featuredTitle: { ...TYPE.title, fontSize: 17, color: COLORS.onPrimary },
  featuredSub: { ...TYPE.caption, color: 'rgba(4,20,10,0.7)', marginTop: 2 },
  featuredArrow: { color: COLORS.onPrimary, fontSize: 22 },

  // ── Menu grid ──
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, gap: 12 },
  menuCard: { width: '46%', backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: 'hidden', ...SHADOW.sm },
  menuEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  iconBox: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  menuIcon: { fontSize: 22 },
  menuLabel: { ...TYPE.bodyStrong, color: COLORS.text, marginBottom: 2 },
  menuSub: { ...TYPE.caption, fontSize: 11, color: COLORS.textSecondary },
});
