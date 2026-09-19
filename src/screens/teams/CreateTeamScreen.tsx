import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, FlatList, KeyboardAvoidingView, Platform, Modal  } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { saveTeam, updateTeam, getMyTeams, formatPlayerName, formatTeamName, ensureMyPlayerLinked, createPlayerMaster, getMyLinkedPlayerId, findAccountByPhone, createGuestPlayerByPhone, getPlayerMasterByAccountPhone, uploadLocalImageToStorage } from '../../utils/firebase';
import { Player } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';
import database from '@react-native-firebase/database';


const ROLES = ['Batter', 'Bowler', 'Wicket Keeper', 'All Rounder'];
const BAT_STYLES = ['Right Hand', 'Left Hand'];
// Purely decorative colour cycle for per-row accents (shirt-number chip,
// left stripe) so a 15-row squad list doesn't read as one flat block. Values
// only ever feed style props — never used in any comparison or logic.
const ACCENT_CYCLE = [COLORS.primary, COLORS.teal, COLORS.orange, COLORS.blue, COLORS.purple, COLORS.yellow];

function PlayerRow({ player, index, captainId, wicketKeeperId, onCaptain, onWK, onExpand, expandedId, onFieldChange, onPhoneLookup, onEditName  }: any) {
  const [localPhone, setLocalPhone] = useState(player.phoneNumber || '');
  const [lookupStatus, setLookupStatus] = useState<'idle'|'checking'|'linked'|'guest'>(
    player.phoneNumber ? (player.playerType === 'registered' ? 'linked' : 'guest') : 'idle'
  );
  const isExpanded = expandedId === player.id;

  const handlePhoneBlur = async () => {
    const digits = localPhone.replace(/\D/g, '');
    if (digits.length !== 10) return;
    setLookupStatus('checking');
    await onPhoneLookup(index, digits, () => {}, setLookupStatus);
  };

  const accent = ACCENT_CYCLE[index % ACCENT_CYCLE.length];

  return (
    <View style={[styles.playerCard, { borderLeftWidth: 3, borderLeftColor: accent }]}>
      <View pointerEvents="none" style={styles.cardEdge} />
      <View style={styles.playerHeader}>
        <View style={[styles.playerNumBox, { borderColor: accent + '55' }]}>
          <Text style={[styles.playerNum, { color: accent }]}>{index + 1}</Text>
        </View>
        <TextInput
          style={[styles.playerInput, { flex: 1.2 }]}
          placeholder={`Phone number ${index < 11 ? '*' : ''}`}
          placeholderTextColor={COLORS.textMuted}
          value={localPhone}
          onChangeText={setLocalPhone}
          onBlur={handlePhoneBlur}
          keyboardType="phone-pad"
          maxLength={10}
        />
        {lookupStatus !== 'idle' && lookupStatus !== 'checking' && (
            player.name ? (
        <Text style={styles.playerNameText} numberOfLines={1}>
          {player.name}
        </Text>
          ) : (
        <TouchableOpacity style={styles.editNameBtn} activeOpacity={0.7} onPress={() => onEditName(index)}>
        <Text style={styles.editNameText} numberOfLines={1}>Edit Name</Text>
        </TouchableOpacity>
          )
          )}
        <TouchableOpacity style={[styles.roleBtn, captainId === player.id && styles.captainActive]} activeOpacity={0.7} onPress={() => onCaptain(player.id)}>
          <Text style={[styles.roleBtnText, captainId === player.id && styles.roleBtnTextOnLight]}>C</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.roleBtn, wicketKeeperId === player.id && styles.wkActive]} activeOpacity={0.7} onPress={() => onWK(player.id)}>
          <Text style={styles.roleBtnText}>WK</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.expandBtnWrap} activeOpacity={0.7} onPress={() => onExpand(player.id)}>
          <Text style={styles.expandBtn}>{isExpanded ? '-' : '+'}</Text>
        </TouchableOpacity>
      </View>
      {lookupStatus === 'checking' && (
        <Text style={[styles.lookupNote, styles.lookupNoteChecking]}>Checking phone number...</Text>
      )}
      {lookupStatus === 'linked' && (
        <View style={styles.lookupNoteRow}>
          <AppIcon emoji="✓" size={12} color={COLORS.primary} />
          <Text style={[styles.lookupNote, styles.lookupNoteLinked]}>Linked to registered account</Text>
        </View>
      )}
      {lookupStatus === 'guest' && (
        <Text style={[styles.lookupNote, styles.lookupNoteGuest]}>No account yet — playing as guest</Text>
      )}
      {isExpanded && (
        <View style={styles.playerDetails}>
          <Text style={styles.detailLabel}>Role</Text>
          <View style={styles.chipRow}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} style={[styles.chip, player.role === r && styles.chipActive]} activeOpacity={0.7} onPress={() => onFieldChange(index, 'role', r)}>
                <Text style={[styles.chipText, player.role === r && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.detailLabel}>Batting Style</Text>
          <View style={styles.chipRow}>
            {BAT_STYLES.map(s => (
              <TouchableOpacity key={s} style={[styles.chip, player.battingStyle === s && styles.chipActive]} activeOpacity={0.7} onPress={() => onFieldChange(index, 'battingStyle', s)}>
                <Text style={[styles.chipText, player.battingStyle === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.detailLabel}>Bowling Style</Text>
          <TextInput style={styles.detailInput} placeholder="e.g. Right Arm Fast" placeholderTextColor={COLORS.textMuted} defaultValue={player.bowlingStyle ?? ''} onEndEditing={e => onFieldChange(index, 'bowlingStyle', e.nativeEvent.text)} blurOnSubmit={false} autoCorrect={false} />
        </View>
      )}
    </View>
  );
}

export default function CreateTeamScreen({ route, navigation }: any) {
  const existingTeam = route.params?.existingTeam ?? null;
  const fromNewMatch = route.params?.fromNewMatch ?? false;
  const teamSlot = route.params?.teamSlot ?? null;
  const prefillName = route.params?.prefillName ?? '';
    // NEW: captain-invite submission mode — locks the team name, and on save
    // submits players to the specific invited team slot instead of creating
    // a brand-new "my teams" entry.
  const captainInviteMode = route.params?.captainInviteMode ?? false;
  const inviteTournamentId = route.params?.inviteTournamentId ?? null;
  const inviteTeamId = route.params?.inviteTeamId ?? null;
  const inviteTeamName = route.params?.inviteTeamName ?? '';

  const teamNameRef = useRef(existingTeam?.name ?? (captainInviteMode ? inviteTeamName : prefillName));
  const [teamNameDisplay, setTeamNameDisplay] = useState(existingTeam?.name ?? (captainInviteMode ? inviteTeamName : prefillName));
  const [logo, setLogo] = useState(existingTeam?.logo ?? null);
  const [saving, setSaving] = useState(false);
  const [captainId, setCaptainId] = useState(existingTeam?.players?.find((p: any) => p.isCaptain)?.id ?? null);
  const [wicketKeeperId, setWicketKeeperId] = useState(existingTeam?.players?.find((p: any) => p.isWicketKeeper)?.id ?? null);
  const [expandedId, setExpandedId] = useState(null);
  const [namePromptFor, setNamePromptFor] = useState<number | null>(null);
  const [namePromptValue, setNamePromptValue] = useState('');
  const initTeamType = route.params?.defaultTeamType ?? existingTeam?.teamType ?? 'my';
  const [teamType, setTeamType] = useState<'my'|'other'>(initTeamType);

  const initPlayers = () => {
    if (existingTeam?.players?.length > 0) {
      const existing = existingTeam.players.map((p: any) => ({ ...p }));
        while (existing.length < 15) existing.push({ id: existing.length, name: '', role: 'Batter', battingStyle: 'Right Hand', bowlingStyle: '', playerType: 'guest', phoneNumber: '', globalPlayerId: null });
      return existing.slice(0, 15);
    }
    return Array.from({ length: 15 }, (_, i) => ({ id: i, name: '', role: 'Batter', battingStyle: 'Right Hand', bowlingStyle: '', playerType: 'guest', globalPlayerId: null }));
  };

  const [players, setPlayers] = useState(initPlayers);

  const pickLogo = () => {
    Alert.alert('Team Logo', 'Choose photo source', [
      { text: 'Camera', onPress: () => launchCamera({ mediaType: 'photo', quality: 0.5 }, res => { if (res.assets?.[0]?.uri) setLogo(res.assets[0].uri); }) },
      { text: 'Gallery', onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.5 }, res => { if (res.assets?.[0]?.uri) setLogo(res.assets[0].uri); }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCaptain = useCallback((id: any) => setCaptainId((prev: any) => prev === id ? null : id), []);
  const handleWK = useCallback((id: any) => setWicketKeeperId((prev: any) => prev === id ? null : id), []);
    const handleExpand = useCallback((id: any) => setExpandedId((prev: any) => prev === id ? null : id), []);

  const handlePhoneLookup = useCallback(async (index: number, phone: string, setLocalName: (n: string) => void, setLookupStatus: (s: any) => void) => {
  const dupe = players.some((p: any, i: number) => i !== index && p.phoneNumber === phone);
  if (dupe) {
    Alert.alert('Duplicate Number', 'This phone number is already used by another player in this team.');
    setLookupStatus('idle');
    return;
  }
  try {
    const account = await findAccountByPhone(phone);
    if (account) {
      const master = await getPlayerMasterByAccountPhone(phone);
      const name = master?.name ?? '';
    if (name) setLocalName(name);
    setPlayers((prev: any[]) => {
      const updated = [...prev];
      // Pull through the registered player's own profile details, not just
      // their name. syncProfileToLinkedPlayer mirrors role/battingStyle/
      // bowlingStyle onto the player master when they save their profile, so
      // these are the player's real choices rather than this screen's
      // 'Batter'/'Right Hand' defaults. Fall back to whatever is already in
      // the row when the player hasn't set a value.
      updated[index] = {
        ...updated[index],
        phoneNumber: phone,
        playerType: 'registered',
        name: name || updated[index].name,
        role: master?.role ?? updated[index].role,
        battingStyle: master?.battingStyle ?? updated[index].battingStyle,
        bowlingStyle: master?.bowlingStyle ?? updated[index].bowlingStyle,
        globalPlayerId: master?.id ?? null,
      };
    return updated;
      });
    setLookupStatus('linked');
    // Linked account exists but has no profile name set yet — prompt so the
    // scorer isn't blocked at Save with an uneditable empty name field.
    if (!name) {
    setNamePromptValue('');
    setNamePromptFor(index);
    }
    } else {
      setPlayers((prev: any[]) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], phoneNumber: phone, playerType: 'guest', globalPlayerId: null };
        return updated;
      });
      setLookupStatus('guest');
      Alert.alert(
        'No Account Found',
        'This phone number has not been registered. Stats will not be permanently tracked until this phone number creates an account.',
        [{ text: 'OK', onPress: () => { setNamePromptValue(''); setNamePromptFor(index); } }]
      );
    }
  } catch (e: any) {
    Alert.alert('Error', 'Could not check phone number: ' + (e?.message ?? 'network error'));
    setLookupStatus('idle');
  }
}, [players]);

const confirmNamePrompt = useCallback(() => {
  if (namePromptFor === null) return;
  const name = namePromptValue.trim();
  if (!name) { Alert.alert('Error', 'Please enter a display name'); return; }
  if (!/^[a-zA-Z]+(?:[\s'-]+[a-zA-Z]+)*$/.test(name)) {
    Alert.alert('Invalid Name', 'Please enter a valid name using letters, spaces, apostrophes or hyphens.');
    return;
  }
  setPlayers((prev: any[]) => {
    const updated = [...prev];
    updated[namePromptFor] = { ...updated[namePromptFor], name };
    return updated;
  });
  setNamePromptFor(null);
  setNamePromptValue('');
}, [namePromptFor, namePromptValue]);

  const handleFieldChange = useCallback((index: number, field: string, value: string) => {
    setPlayers((prev: any[]) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field === '_name' ? 'name' : field]: value };
      return updated;
    });
  }, []);

    const fromTournament = route.params?.fromTournament ?? false;
    const tournamentIdParam = route.params?.tournamentId ?? null;

    const handleSave = async () => {
    const name = teamNameRef.current.trim();
    if (!name) { Alert.alert('Error', 'Please enter team name'); return; }
    if (captainId === null) { Alert.alert('Error', 'Please select a Captain (tap C button)'); return; }
    if (wicketKeeperId === null) { Alert.alert('Error', 'Please select a Wicket Keeper (tap WK button)'); return; }
    const filled = players.filter((p: any) => p.phoneNumber?.trim() && p.name?.trim());
      if (filled.length < 11) { Alert.alert('Error', `Enter phone number + name for at least 11 players (${filled.length} entered)`); return; }
    const seenNames = new Set<string>();
    const dupeName = filled.find((p: any) => {
      const key = p.name.trim().toLowerCase();
      if (seenNames.has(key)) return true;
      seenNames.add(key);
      return false;
    });
    if (dupeName) { Alert.alert('Error', 'Duplicate player names found. Each player must have a unique name.'); return; }
    if (!filled.map((p: any) => p.id).includes(captainId)) { Alert.alert('Error', 'Captain must have a name'); return; }
    if (!filled.map((p: any) => p.id).includes(wicketKeeperId)) { Alert.alert('Error', 'Wicket Keeper must have a name'); return; }
    setSaving(true);
    try {
      // Logo upload has no data dependency on the player-creation below, so
      // run them concurrently instead of blocking one on the other.
      const uploadPromise: Promise<string | null> =
        logo && !/^https?:\/\//.test(logo)
          ? uploadLocalImageToStorage(
              logo,
              existingTeam?.id
                ? `team_logos/${existingTeam.id}.jpg`
                : `team_logos/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
            )
          : Promise.resolve(logo);

      // Resolve a globalPlayerId for every filled player slot.
      // 'registered' slot = the current logged-in account, linked via ensureMyPlayerLinked.
      // 'guest' slots only get a NEW player master record if they don't already have
      // a globalPlayerId (so editing an existing team never creates duplicates).
      // Independent per player, so resolved concurrently rather than one at a time —
      // with an 11+ player roster that was previously 11+ sequential round trips.
      const finalPlayersPromise = Promise.all(filled.map(async (p: any) => {
        const formattedName = formatPlayerName(p.name);
        let globalPlayerId = p.globalPlayerId ?? null;
        if (p.playerType === 'registered' && globalPlayerId) {
          // Already linked via phone lookup — nothing further to create.
        } else if (p.phoneNumber) {
          globalPlayerId = await createGuestPlayerByPhone(p.phoneNumber, formattedName);
        } else if (!globalPlayerId) {
          // No phone entered at all — fallback so match creation never blocks.
          globalPlayerId = await createPlayerMaster(formattedName, 'guest');
        }
        return {
          id: p.id, name: formattedName, role: p.role ?? 'Batter',
          battingStyle: p.battingStyle ?? 'Right Hand', bowlingStyle: p.bowlingStyle ?? '',
          isCaptain: p.id === captainId, isWicketKeeper: p.id === wicketKeeperId,
          playerType: p.playerType ?? 'guest', phoneNumber: p.phoneNumber ?? null, globalPlayerId,
        };
      }));

      const [uploadedLogo, finalPlayers] = await Promise.all([uploadPromise, finalPlayersPromise]);

      const formattedTeamName = formatTeamName(name);
      if (captainInviteMode) {
        const { submitCaptainTeam, areTeamsLockedNow } = require('../../utils/firebase');
        const tSnap = await database().ref(`tournaments/${inviteTournamentId}`).once('value');
        const tournamentSnapshot = tSnap.val();
        if (tournamentSnapshot && areTeamsLockedNow(tournamentSnapshot)) {
          Alert.alert('Team Locked', 'The organizer has locked team rosters — players can no longer be added or changed.');
          setSaving(false);
          return;
        }
        await submitCaptainTeam(inviteTournamentId, inviteTeamId, finalPlayers);
        Alert.alert('Submitted!', `Your squad for "${inviteTeamName}" has been submitted to the organizer.`, [
          { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }) },
        ]);
        setSaving(false);
        return;
      }
      if (existingTeam?.id) {
        await updateTeam(existingTeam.id, { name: formattedTeamName, logo: uploadedLogo ?? undefined, players: finalPlayers });
        Alert.alert('Updated!', `"${formattedTeamName}" updated.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const teamId = await saveTeam({
          name: formattedTeamName,
          logo: uploadedLogo ?? undefined,
          players: finalPlayers,
          teamType
          });

Alert.alert(
  'Saved!',
  '"' + formattedTeamName + '" saved as ' +
  (teamType === 'my' ? 'My Team' : 'Other Team') +
  '.',
  [{
    text: 'OK',
    onPress: async () => {
      if (fromTournament && tournamentIdParam) {
        try {
          const database = require('@react-native-firebase/database').default;
          const { updateTournament } = require('../../utils/firebase');
          const snap = await database().ref('tournaments/' + tournamentIdParam).once('value');
          const tournament = snap.val();
          const newTeam = { teamId: teamId, teamName: formattedTeamName, logo: uploadedLogo, players: finalPlayers, played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0 };
          await updateTournament(tournamentIdParam, { teams: [...(tournament?.teams ?? []), newTeam] });
        } catch (e) { console.warn('Could not auto-add team to tournament', e); }
        navigation.navigate('TournamentDetail', { tournamentId: tournamentIdParam });
      } else if (fromNewMatch) {
        navigation.navigate('NewMatch', {
          savedTeam: { name: formattedTeamName, players: finalPlayers, logo: uploadedLogo },
          teamSlot
        });
      } else {
        navigation.goBack();
      }
    }
  }]
);
      }
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  const filledCount = players.filter((p: any) => p.phoneNumber?.trim() && p.name?.trim()).length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={existingTeam ? 'Edit Team' : 'Create Team'} onBack={() => navigation.goBack()} rightText={saving ? 'Saving...' : 'Save'} onRight={handleSave} />
      <View style={styles.topSection}>
        {/* Soft colour blob in the corner — purely decorative, non-interactive,
            clipped by topSection's overflow:hidden so it never affects hit areas. */}
        <View pointerEvents="none" style={styles.topBlob} />
        <View style={styles.logoWrap}>
          {/* Two-tone ring behind the logo, echoing the header's accent line. */}
          <View pointerEvents="none" style={styles.logoRing} />
          <TouchableOpacity style={styles.logoCircle} activeOpacity={0.8} onPress={pickLogo}>
            {logo ? <Image source={{ uri: logo }} style={styles.logoImg} /> : (
              <View style={styles.logoPlaceholder}>
              <AppIcon emoji="📷" size={22} color={COLORS.primary} />
              <Text style={styles.logoLabel}>Add Logo</Text>
              </View>
               )}
          </TouchableOpacity>
        </View>
        <View style={styles.topRight}>
          <TextInput style={styles.teamNameInput} placeholder="Team Name *" placeholderTextColor={COLORS.textMuted} defaultValue={teamNameDisplay} onChangeText={text => { teamNameRef.current = text; }} onEndEditing={e => setTeamNameDisplay(e.nativeEvent.text)} autoCorrect={false} autoCapitalize="words" editable={!captainInviteMode} />
          {/* Team Type Selector */}
          {!existingTeam && (
            <View style={styles.teamTypeRow}>
              <TouchableOpacity style={[styles.roleBtn, teamType === 'my' && styles.teamTypeActive, styles.teamTypeBtn]} activeOpacity={0.8} onPress={() => setTeamType('my')}>
                <Text style={[styles.roleBtnText, styles.teamTypeText]}>My Team</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleBtn, teamType === 'other' && styles.teamTypeOtherActive, styles.teamTypeBtn]} activeOpacity={0.8} onPress={() => setTeamType('other')}>
                <Text style={[styles.roleBtnText, styles.teamTypeText]}>Other Team</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.roleStatusRow}>
            <View style={[styles.roleStatus, captainId !== null && styles.roleStatusDone]}>
              <Text style={styles.roleStatusText} numberOfLines={1}>{captainId !== null ? `C: ${players.find((p: Player) => p.id === captainId)?.name || 'Captain'}` : 'Set Captain *'}</Text>
            </View>
            <View style={[styles.roleStatus, wicketKeeperId !== null && styles.roleStatusDone]}>
              <Text style={styles.roleStatusText} numberOfLines={1}>{wicketKeeperId !== null ? `WK: ${players.find((p: Player) => p.id === wicketKeeperId)?.name || 'WK'}` : 'Set WK *'}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.playersHeader}>
        <View style={styles.playersHeaderRow}>
          <View pointerEvents="none" style={styles.playersBar} />
          <Text style={styles.playersTitle}>Players ({filledCount}/15) — Min 11 required</Text>
        </View>
        <Text style={styles.playersHint}>C = Captain   WK = Keeper   +/- = Details</Text>
      </View>
      <FlatList
        initialNumToRender={15} maxToRenderPerBatch={15} windowSize={10}
        keyboardShouldPersistTaps="always" keyboardDismissMode="none"
        data={players} keyExtractor={(item: any) => `p-${item.id}`}
        renderItem={({ item, index }: any) => (
          <PlayerRow player={item} index={index} captainId={captainId} wicketKeeperId={wicketKeeperId}
            onCaptain={handleCaptain} onWK={handleWK} onExpand={handleExpand} expandedId={expandedId} onFieldChange={handleFieldChange} onPhoneLookup={handlePhoneLookup} 
              onEditName={(idx: number) => { setNamePromptValue(''); setNamePromptFor(idx); }} />
          )}
        removeClippedSubviews={false}
        ListFooterComponent={
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} activeOpacity={0.85} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : existingTeam ? 'Update Team' : 'Save Team'}</Text>
            </TouchableOpacity>
            <View style={{ height: 50 }} />
          </View>
        }
      />

      <Modal visible={namePromptFor !== null} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View pointerEvents="none" style={styles.cardEdge} />
            <Text style={styles.modalTitle}>Enter Display Name</Text>
            <Text style={styles.modalBody}>
              This is a temporary name for this match only — it will be replaced automatically once this number registers.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. King"
              placeholderTextColor={COLORS.textMuted}
              value={namePromptValue}
              onChangeText={setNamePromptValue}
              autoFocus
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.modalBtn} activeOpacity={0.85} onPress={confirmNamePrompt}>
              <Text style={styles.modalBtnText}>Save Name</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ── Team identity block ──
  topSection: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  // Soft violet-to-purple blob tucked in the corner — same tinted-View
  // technique as StatCard's `tint`, clipped by topSection's overflow:hidden.
  topBlob: {
    position: 'absolute', top: -30, right: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: COLORS.purple, opacity: 0.12,
  },
  logoWrap: { width: 74, height: 74, flexShrink: 0 },
  // Two-tone ring behind the logo circle, echoing Header's two-colour accent
  // line — purely decorative, sits behind the touchable and never intercepts
  // touches (pointerEvents="none" on the JSX element).
  logoRing: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 43, borderWidth: 2, borderColor: COLORS.purple, opacity: 0.5,
  },
  logoCircle: {
    width: 74, height: 74, borderRadius: 37, overflow: 'hidden',
    borderWidth: 2, borderColor: COLORS.primary, flexShrink: 0,
    ...SHADOW.glow(COLORS.primary),
  },
  logoImg: { width: '100%', height: '100%' },
  logoPlaceholder: { flex: 1, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center' },
  cameraIcon: { fontSize: 22 },
  logoLabel: { ...TYPE.label, fontSize: 8, color: COLORS.primaryLight, marginTop: 3 },
  topRight: { flex: 1, gap: SPACING.sm },
  // The team name is the primary field on the screen, so it gets the accent
  // border and the largest type in this block.
  teamNameInput: {
    backgroundColor: COLORS.card2, color: COLORS.text,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderRadius: RADIUS.md,
    ...TYPE.title,
    borderWidth: 1, borderColor: COLORS.primary,
  },

  // ── My Team / Other Team switch ──
  teamTypeRow: { flexDirection: 'row', gap: 6 },
  teamTypeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS.round },
  // Tinted rather than solid, so the white label keeps its contrast.
  teamTypeActive: { backgroundColor: COLORS.primary + '2e', borderColor: COLORS.primary },
  teamTypeOtherActive: { backgroundColor: COLORS.blue + '2e', borderColor: COLORS.blue },
  // Case preserved deliberately: TYPE.label would uppercase these button
  // labels, and the switch reads better in sentence case next to the name field.
  teamTypeText: { ...TYPE.caption, fontSize: 11, fontWeight: '700', textTransform: 'none' },

  roleStatusRow: { flexDirection: 'row', gap: 8 },
  roleStatus: {
    flex: 1, backgroundColor: COLORS.card2,
    borderRadius: RADIUS.round, paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: COLORS.warning + '66', alignItems: 'center',
  },
  roleStatusDone: { borderColor: COLORS.primary + '77', backgroundColor: COLORS.primarySoft },
  // Holds a player's name, so it must not be uppercased.
  roleStatusText: { ...TYPE.caption, fontSize: 10, fontWeight: '700', color: COLORS.text },

  // ── Squad list ──
  playersHeader: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  playersHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  playersBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: COLORS.primary },
  playersTitle: { ...TYPE.bodyStrong, color: COLORS.text },
  playersHint: { ...TYPE.caption, fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  playerCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  playerHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.sm, gap: 6 },
  playerNumBox: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1, borderColor: COLORS.primary + '55',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  // Tabular so slots 1-9 and 10-15 keep the same width.
  playerNum: { ...TYPE.numSm, fontSize: 11, color: COLORS.primaryLight },
  playerInput: {
    flex: 1, color: COLORS.text,
    ...TYPE.body,
    paddingVertical: 9, paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.card2, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  playerNameText: { ...TYPE.bodyStrong, color: COLORS.text, flex: 1, paddingHorizontal: 4 },
  editNameBtn: { flex: 1, paddingHorizontal: 4 },
  editNameText: { ...TYPE.caption, fontWeight: '700', color: COLORS.warning },

  roleBtn: {
    minWidth: 32, paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: RADIUS.sm, alignItems: 'center',
    backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
  },
  captainActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow, ...SHADOW.glow(COLORS.yellow) },
  wkActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue, ...SHADOW.glow(COLORS.blue) },
  regActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleBtnText: { ...TYPE.label, fontSize: 10, color: COLORS.text },
  // Dark ink on the yellow captain pill — white on yellow was unreadable.
  roleBtnTextOnLight: { color: COLORS.onAccent },
  expandBtnWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card2,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  expandBtn: { color: COLORS.primary, fontSize: 18, fontWeight: '800', lineHeight: 20 },

  // ── Phone-lookup feedback ──
  lookupNote: { ...TYPE.caption, fontSize: 11, paddingHorizontal: 12, paddingBottom: 8 },
  lookupNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingBottom: 8 },
  lookupNoteChecking: { color: COLORS.textMuted },
  lookupNoteLinked: { color: COLORS.primary, paddingHorizontal: 0, paddingBottom: 0 },
  lookupNoteGuest: { color: COLORS.warning },

  // ── Expanded player details ──
  playerDetails: {
    padding: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft,
    backgroundColor: COLORS.card2,
  },
  detailLabel: { ...TYPE.label, color: COLORS.textSecondary, marginBottom: 8, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.round,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { ...TYPE.caption, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.onPrimary, fontWeight: '700' },
  detailInput: {
    backgroundColor: COLORS.card, color: COLORS.text,
    paddingHorizontal: SPACING.sm, paddingVertical: 10,
    borderRadius: RADIUS.sm, ...TYPE.body,
    borderWidth: 1, borderColor: COLORS.border,
  },

  // ── Save ──
  footer: { paddingHorizontal: SPACING.lg },
  saveBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 16,
    borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACING.md,
    ...SHADOW.glow(COLORS.primary),
  },
  saveBtnDisabled: { backgroundColor: COLORS.card2, shadowOpacity: 0, elevation: 0 },
  saveBtnText: { ...TYPE.button, fontSize: 16, color: COLORS.onPrimary },

  // ── Display-name prompt ──
  modalScrim: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'center', padding: SPACING.lg },
  modalCard: {
    backgroundColor: COLORS.surface3, borderRadius: RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  modalTitle: { ...TYPE.h2, color: COLORS.text, marginBottom: SPACING.sm },
  modalBody: { ...TYPE.body, color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 20 },
  modalInput: {
    backgroundColor: COLORS.card, color: COLORS.text,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderRadius: RADIUS.md, ...TYPE.body,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  modalBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: RADIUS.md, alignItems: 'center',
    ...SHADOW.glow(COLORS.primary),
  },
  modalBtnText: { ...TYPE.button, color: COLORS.onPrimary },
});