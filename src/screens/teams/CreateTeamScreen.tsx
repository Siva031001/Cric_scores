import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { saveTeam, updateTeam, getMyTeams, formatPlayerName, formatTeamName, ensureMyPlayerLinked, createPlayerMaster, getMyLinkedPlayerId } from '../../utils/firebase';
import { Player } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

const ROLES = ['Batter', 'Bowler', 'Wicket Keeper', 'All Rounder'];
const BAT_STYLES = ['Right Hand', 'Left Hand'];

function PlayerRow({ player, index, captainId, wicketKeeperId, onCaptain, onWK, onExpand, expandedId, onFieldChange, onTogglePlayerType }: any) {
  const [localName, setLocalName] = useState(player.name || '');
  const isExpanded = expandedId === player.id;
  return (
    <View style={styles.playerCard}>
      <View style={styles.playerHeader}>
        <View style={styles.playerNumBox}>
          <Text style={styles.playerNum}>{index + 1}</Text>
        </View>
        <TextInput
          style={styles.playerInput}
          placeholder={`Player ${index + 1}${index < 11 ? ' *' : ''}`}
          placeholderTextColor={COLORS.textMuted}
          value={localName}
          onChangeText={text => { setLocalName(text); onFieldChange(index, '_name', text); }}
          blurOnSubmit={false}
          returnKeyType="next"
          autoCorrect={false}
          autoCapitalize="words"
        />
        <TouchableOpacity style={[styles.roleBtn, captainId === player.id && styles.captainActive]} onPress={() => onCaptain(player.id)}>
          <Text style={styles.roleBtnText}>C</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.roleBtn, wicketKeeperId === player.id && styles.wkActive]} onPress={() => onWK(player.id)}>
          <Text style={styles.roleBtnText}>WK</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.roleBtn, player.playerType === 'registered' && styles.regActive]} onPress={() => onTogglePlayerType(player.id)}>
          <Text style={styles.roleBtnText}>{player.playerType === 'registered' ? 'Me' : 'Guest'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onExpand(player.id)}>
          <Text style={styles.expandBtn}>{isExpanded ? '-' : '+'}</Text>
        </TouchableOpacity>
      </View>
      {isExpanded && (
        <View style={styles.playerDetails}>
          <Text style={styles.detailLabel}>Role</Text>
          <View style={styles.chipRow}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} style={[styles.chip, player.role === r && styles.chipActive]} onPress={() => onFieldChange(index, 'role', r)}>
                <Text style={[styles.chipText, player.role === r && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.detailLabel}>Batting Style</Text>
          <View style={styles.chipRow}>
            {BAT_STYLES.map(s => (
              <TouchableOpacity key={s} style={[styles.chip, player.battingStyle === s && styles.chipActive]} onPress={() => onFieldChange(index, 'battingStyle', s)}>
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

  const teamNameRef = useRef(existingTeam?.name ?? prefillName);
  const [teamNameDisplay, setTeamNameDisplay] = useState(existingTeam?.name ?? prefillName);
  const [logo, setLogo] = useState(existingTeam?.logo ?? null);
  const [saving, setSaving] = useState(false);
  const [captainId, setCaptainId] = useState(existingTeam?.players?.find((p: any) => p.isCaptain)?.id ?? null);
  const [wicketKeeperId, setWicketKeeperId] = useState(existingTeam?.players?.find((p: any) => p.isWicketKeeper)?.id ?? null);
  const [expandedId, setExpandedId] = useState(null);
  const initTeamType = route.params?.defaultTeamType ?? existingTeam?.teamType ?? 'my';
  const [teamType, setTeamType] = useState<'my'|'other'>(initTeamType);

  const initPlayers = () => {
    if (existingTeam?.players?.length > 0) {
      const existing = existingTeam.players.map((p: any) => ({ ...p }));
      while (existing.length < 15) existing.push({ id: existing.length, name: '', role: 'Batter', battingStyle: 'Right Hand', bowlingStyle: '', playerType: 'guest', globalPlayerId: null });
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

  const handleTogglePlayerType = useCallback((id: any) => {
    setPlayers((prev: any[]) => prev.map((p: any) => {
      if (p.id === id) {
        return { ...p, playerType: p.playerType === 'registered' ? 'guest' : 'registered' };
      }
      // Only one "registered (me)" slot allowed per team
      if (p.playerType === 'registered') return { ...p, playerType: 'guest' };
      return p;
    }));
  }, []);

  const handleFieldChange = useCallback((index: number, field: string, value: string) => {
    setPlayers((prev: any[]) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field === '_name' ? 'name' : field]: value };
      return updated;
    });
  }, []);

  const handleSave = async () => {
    const name = teamNameRef.current.trim();
    if (!name) { Alert.alert('Error', 'Please enter team name'); return; }
    if (captainId === null) { Alert.alert('Error', 'Please select a Captain (tap C button)'); return; }
    if (wicketKeeperId === null) { Alert.alert('Error', 'Please select a Wicket Keeper (tap WK button)'); return; }
    const filled = players.filter((p: any) => p.name?.trim());
    if (filled.length < 11) { Alert.alert('Error', `Enter at least 11 player names (${filled.length} entered)`); return; }
    if (!filled.map((p: any) => p.id).includes(captainId)) { Alert.alert('Error', 'Captain must have a name'); return; }
    if (!filled.map((p: any) => p.id).includes(wicketKeeperId)) { Alert.alert('Error', 'Wicket Keeper must have a name'); return; }
    setSaving(true);
    try {
      // Resolve a globalPlayerId for every filled player slot.
      // 'registered' slot = the current logged-in account, linked via ensureMyPlayerLinked.
      // 'guest' slots only get a NEW player master record if they don't already have
      // a globalPlayerId (so editing an existing team never creates duplicates).
      const finalPlayers: any[] = [];
      for (const p of filled) {
        const formattedName = formatPlayerName(p.name);
        let globalPlayerId = p.globalPlayerId ?? null;
        if (p.playerType === 'registered') {
          globalPlayerId = await ensureMyPlayerLinked(formattedName);
        } else if (!globalPlayerId) {
          globalPlayerId = await createPlayerMaster(formattedName, 'guest');
        }
        finalPlayers.push({
          id: p.id, name: formattedName, role: p.role ?? 'Batter',
          battingStyle: p.battingStyle ?? 'Right Hand', bowlingStyle: p.bowlingStyle ?? '',
          isCaptain: p.id === captainId, isWicketKeeper: p.id === wicketKeeperId,
          playerType: p.playerType ?? 'guest', globalPlayerId,
        });
      }
      const formattedTeamName = formatTeamName(name);
      if (existingTeam?.id) {
        await updateTeam(existingTeam.id, { name, logo: logo ?? undefined, players: finalPlayers });
        Alert.alert('Updated!', `"${name}" updated.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await saveTeam({
          name: formattedTeamName,
          logo: logo ?? undefined,
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
            onPress: () => {
              if (fromNewMatch) {
                navigation.navigate('NewMatch', {
                  savedTeam: {
                    name: formattedTeamName,
                    players: finalPlayers,
                    logo
                  },
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

  const filledCount = players.filter((p: any) => p.name?.trim()).length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={existingTeam ? 'Edit Team' : 'Create Team'} onBack={() => navigation.goBack()} rightText={saving ? 'Saving...' : 'Save'} onRight={handleSave} />
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.logoCircle} onPress={pickLogo}>
          {logo ? <Image source={{ uri: logo }} style={styles.logoImg} /> : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.logoLabel}>Add Logo</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.topRight}>
          <TextInput style={styles.teamNameInput} placeholder="Team Name *" placeholderTextColor={COLORS.textMuted} defaultValue={teamNameDisplay} onChangeText={text => { teamNameRef.current = text; }} onEndEditing={e => setTeamNameDisplay(e.nativeEvent.text)} autoCorrect={false} autoCapitalize="words" />
          {/* Team Type Selector */}
          {!existingTeam && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <TouchableOpacity style={[styles.roleBtn, teamType === 'my' && styles.captainActive, { flex: 1, alignItems: 'center', paddingVertical: 6 }]} onPress={() => setTeamType('my')}>
                <Text style={[styles.roleBtnText, { fontSize: 12 }]}>My Team</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleBtn, teamType === 'other' && { backgroundColor: COLORS.blue, borderColor: COLORS.blue }, { flex: 1, alignItems: 'center', paddingVertical: 6 }]} onPress={() => setTeamType('other')}>
                <Text style={[styles.roleBtnText, { fontSize: 12 }]}>Other Team</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.roleStatusRow}>
            <View style={[styles.roleStatus, captainId !== null && styles.roleStatusDone]}>
              <Text style={styles.roleStatusText}>{captainId !== null ? `C: ${players.find((p: Player) => p.id === captainId)?.name || 'Captain'}` : 'Set Captain *'}</Text>
            </View>
            <View style={[styles.roleStatus, wicketKeeperId !== null && styles.roleStatusDone]}>
              <Text style={styles.roleStatusText}>{wicketKeeperId !== null ? `WK: ${players.find((p: Player) => p.id === wicketKeeperId)?.name || 'WK'}` : 'Set WK *'}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.playersHeader}>
        <Text style={styles.playersTitle}>Players ({filledCount}/15) — Min 11 required</Text>
        <Text style={styles.playersHint}>C = Captain   WK = Keeper   +/- = Details</Text>
        <Text style={[styles.playersHint, {marginTop: 4}]}>Tap 'Guest' on YOUR OWN row to mark it as 'Me' — only one player per team can be marked Me</Text>
      </View>
      <FlatList
        initialNumToRender={15} maxToRenderPerBatch={15} windowSize={10}
        keyboardShouldPersistTaps="always" keyboardDismissMode="none"
        data={players} keyExtractor={(item: any) => `p-${item.id}`}
        renderItem={({ item, index }: any) => (
          <PlayerRow player={item} index={index} captainId={captainId} wicketKeeperId={wicketKeeperId}
            onCaptain={handleCaptain} onWK={handleWK} onExpand={handleExpand} expandedId={expandedId} onFieldChange={handleFieldChange} onTogglePlayerType={handleTogglePlayerType} />
        )}
        removeClippedSubviews={false}
        ListFooterComponent={
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : existingTeam ? 'Update Team' : 'Save Team'}</Text>
            </TouchableOpacity>
            <View style={{ height: 50 }} />
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topSection: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  logoCircle: { width: 70, height: 70, borderRadius: 35, overflow: 'hidden', borderWidth: 2, borderColor: COLORS.primary, flexShrink: 0 },
  logoImg: { width: '100%', height: '100%' },
  logoPlaceholder: { flex: 1, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  cameraIcon: { fontSize: 22 },
  logoLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  topRight: { flex: 1, gap: 8 },
  teamNameInput: { backgroundColor: COLORS.card, color: COLORS.text, padding: 12, borderRadius: RADIUS.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.primary },
  roleStatusRow: { flexDirection: 'row', gap: 8 },
  roleStatus: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.sm, padding: 6, borderWidth: 1, borderColor: COLORS.red, alignItems: 'center' },
  roleStatusDone: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  roleStatusText: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
  playersHeader: { paddingHorizontal: SPACING.lg, paddingVertical: 8, backgroundColor: COLORS.card2 },
  playersTitle: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  playersHint: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  playerCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, marginTop: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  playerHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 6 },
  playerNumBox: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  playerNum: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  playerInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: COLORS.card2, borderRadius: RADIUS.sm },
  roleBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  captainActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  wkActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  regActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleBtnText: { color: COLORS.text, fontSize: 11, fontWeight: 'bold' },
  expandBtn: { color: COLORS.primary, fontSize: 20, fontWeight: 'bold', paddingHorizontal: 4 },
  playerDetails: { padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.card2 },
  detailLabel: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.round, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 11 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  detailInput: { backgroundColor: COLORS.card, color: COLORS.text, padding: 8, borderRadius: RADIUS.sm, fontSize: 13, borderWidth: 1, borderColor: COLORS.border },
  footer: { paddingHorizontal: SPACING.lg },
  saveBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 15 },
  saveBtnDisabled: { backgroundColor: COLORS.textMuted },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});