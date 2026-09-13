import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, ScrollView, Image, StatusBar, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { signInAnonymously, getCurrentUser, subscribeToProfile, getUserProfile, getMyTeams, getMatchHistory } from '../../utils/firebase';
import { AdBanner } from '../../components/AdPlaceholder';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { getPublicTournaments, searchPublicTournaments, getHomePageTournaments, getTournamentDisplayStatus } from '../../utils/firebase';
import LiveTournamentCarousel from '../../components/LiveTournamentCarousel';
import AppIcon from '../../components/AppIcon';

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

  // getPublicTournaments() reads the WHOLE tournaments node (there is no
  // .indexOn for its orderByChild('createdAt'), so Firebase downloads every
  // tournament — each with its teams, rosters, pools, fixtures and matches
  // — and filters client-side). That is far too expensive to re-run on every
  // focus, which is what a bare useFocusEffect did: navigating anywhere and
  // coming back re-downloaded the entire collection, and Home took tens of
  // seconds to settle. Refresh on focus is still useful so a newly created
  // tournament appears, so keep it but throttle it.
  const tournamentsFetchedAtRef = useRef(0);
  const TOURNAMENTS_TTL_MS = 60 * 1000;
  useFocusEffect(useCallback(() => {
    if (Date.now() - tournamentsFetchedAtRef.current < TOURNAMENTS_TTL_MS) return;
    tournamentsFetchedAtRef.current = Date.now();
    getPublicTournaments()
      .then(setPublicTournaments)
      .catch(() => {
        // Allow an immediate retry on the next focus rather than caching the failure.
        tournamentsFetchedAtRef.current = 0;
        setPublicTournaments([]);
      });
  }, []));

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
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <AppIcon emoji="⚙️" size={24} color={COLORS.text} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AppIcon emoji="🔴" size={13} color={COLORS.red} />
                <Text style={[st.liveSectionTitle, { marginBottom: 0 }]}>Live Matches</Text>
              </View>
              {liveMatches.map((m: any) => (
                <TouchableOpacity key={m.id} style={st.liveCard} onPress={() => navigation.navigate('Scoring', { matchId: m.id })}>
                  <Text style={st.liveTeams}>{m.team1} vs {m.team2}</Text>
                  <Text style={st.liveScore}>{m.innings1?.runs ?? 0}/{m.innings1?.wickets ?? 0}{m.currentInnings === 2 ? ' | ' + (m.innings2?.runs ?? 0) + '/' + (m.innings2?.wickets ?? 0) : ''}</Text>
                  <Text style={st.liveContinue}>Tap to continue →</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Public Tournament Discovery */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: 10 }}>
              <Text style={[st.liveSectionTitle, { marginBottom: 0 }]}>Discover Tournaments</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: SPACING.lg, marginBottom: 10 }}>
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
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.round,
                    backgroundColor: tournamentFilter === f.key ? COLORS.primary : COLORS.card2,
                  }}
                >
                  <Text style={{ color: tournamentFilter === f.key ? '#fff' : COLORS.textSecondary, fontSize: 11, fontWeight: 'bold' }}>{f.label}</Text>
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
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: 55, paddingBottom: 15 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, borderColor: COLORS.primary },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  greeting: { color: COLORS.textSecondary, fontSize: 12 },
  profileName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  settingsIcon: { fontSize: 24 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, borderRadius: RADIUS.round, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 5, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, padding: 0 },
  clearBtn: { color: COLORS.textSecondary, fontSize: 16 },
  searchResultsBox: { backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, borderRadius: RADIUS.md, marginTop: 5, borderWidth: 1, borderColor: COLORS.border, maxHeight: 350 },
  noResults: { color: COLORS.textSecondary, padding: 20, textAlign: 'center' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  searchResultIcon: { fontSize: 22 },
  searchResultTitle: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  searchResultSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  searchResultType: { color: COLORS.primary, fontSize: 11, fontWeight: 'bold', backgroundColor: COLORS.primary + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.round },
  liveSection: { paddingHorizontal: SPACING.lg, marginBottom: 10, marginTop: 10 },
  liveSectionTitle: { color: COLORS.red, fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  liveCard: { backgroundColor: COLORS.red + '22', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.red + '55', marginBottom: 8 },
  liveTeams: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  liveScore: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold', marginTop: 3 },
  liveContinue: { color: COLORS.red, fontSize: 11, marginTop: 4 },
  featuredBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, padding: 18, marginBottom: 20, marginTop: 10 },
  featuredLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featuredIcon: { fontSize: 32 },
  featuredTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  featuredSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  featuredArrow: { color: '#fff', fontSize: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, gap: 12 },
  menuCard: { width: '46%', backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  iconBox: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  menuIcon: { fontSize: 22 },
  menuLabel: { color: COLORS.text, fontSize: 14, fontWeight: 'bold', marginBottom: 3 },
  menuSub: { color: COLORS.textSecondary, fontSize: 11 },
});