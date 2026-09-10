// ─────────────────────────────────────────────────────────────
// SUBSTITUTES, REPLACEMENTS, CONCUSSION REPLACEMENTS
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// A replacement is a RELATIONSHIP between two players, not a rename. The
// original player id is never reused or overwritten, which is what
// preserves their historical statistics: their stat entries stay keyed to
// their own id, and the replacement accumulates under theirs.
//
// The four kinds are genuinely different in law and must not be collapsed:
//
//   FIELDER     — may field only. Cannot bat, cannot bowl.
//   BATTING     — may bat (competition-specific; rare in senior cricket).
//   BOWLING     — may bowl (competition-specific).
//   CONCUSSION  — like-for-like, may bat AND bowl, subject to approval.
//
// Eligibility is therefore a rules question, answered here, rather than
// something a screen decides by swapping an id.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  EngineError,
  PlayerMatchStatus,
  Replacement,
  ReplacementType,
} from './types';

export interface PlayerStatusRecord {
  playerId: number;
  teamName: string;
  status: PlayerMatchStatus;
}

/** What each replacement kind is permitted to do. */
const CAPABILITIES: Record<ReplacementType, { bat: boolean; bowl: boolean; field: boolean }> = {
  FIELDER: { bat: false, bowl: false, field: true },
  BATTING: { bat: true, bowl: false, field: true },
  BOWLING: { bat: false, bowl: true, field: true },
  CONCUSSION: { bat: true, bowl: true, field: true },
};

export const capabilitiesFor = (type: ReplacementType) => CAPABILITIES[type];

/** Human-readable label for the scorecard and the replacement list. */
export const replacementLabel = (type: ReplacementType): string => {
  switch (type) {
    case 'FIELDER': return 'Substitute fielder';
    case 'BATTING': return 'Batting replacement';
    case 'BOWLING': return 'Bowling replacement';
    case 'CONCUSSION': return 'Concussion replacement';
    default: return 'Replacement';
  }
};

export interface CreateReplacementInput {
  originalPlayerId: number;
  replacementPlayerId: number;
  replacementType: ReplacementType;
  teamName: string;
  reason?: string | null;
  approved?: boolean;
  rules: CompetitionRules;
  existing: Replacement[];
  timestamp?: number;
  makeId?: (prefix: string) => string;
}

let counter = 0;
const defaultId = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;
export const __resetReplacementCounter = () => {
  counter = 0;
};

/**
 * Validates and creates a replacement record.
 *
 * A concussion replacement requires an explicit approval flag, because in
 * every competition that allows one it is subject to match-official
 * approval — recording it silently would misrepresent the process.
 */
export const createReplacement = (input: CreateReplacementInput): Replacement => {
  const {
    originalPlayerId,
    replacementPlayerId,
    replacementType,
    teamName,
    rules,
    existing,
  } = input;

  if (originalPlayerId === replacementPlayerId) {
    throw new EngineError('INVALID_REPLACEMENT', 'A player cannot replace themselves');
  }

  if (replacementType === 'CONCUSSION') {
    if (!rules.concussionReplacementEnabled) {
      throw new EngineError(
        'DISABLED',
        'Concussion replacements are not enabled for this competition'
      );
    }
    if (!input.approved) {
      throw new EngineError(
        'NOT_APPROVED',
        'A concussion replacement must be approved by the match official before it takes effect'
      );
    }
    if (!input.reason) {
      throw new EngineError('MISSING_REASON', 'A concussion replacement must record a reason');
    }
  }

  // The same player cannot be brought on twice, and a player who has
  // already been replaced cannot come back on as someone else's substitute.
  if (existing.some(r => r.replacementPlayerId === replacementPlayerId)) {
    throw new EngineError(
      'ALREADY_USED',
      'That player has already come on as a replacement in this match'
    );
  }
  if (existing.some(r => r.originalPlayerId === replacementPlayerId)) {
    throw new EngineError(
      'ALREADY_REPLACED',
      'That player has already been replaced and cannot return as a substitute'
    );
  }
  if (existing.some(r => r.originalPlayerId === originalPlayerId)) {
    throw new EngineError(
      'ALREADY_REPLACED',
      'That player has already been replaced'
    );
  }

  const makeId = input.makeId ?? defaultId;
  return {
    id: makeId('repl'),
    originalPlayerId,
    replacementPlayerId,
    replacementType,
    reason: input.reason ?? null,
    approved: !!input.approved,
    timestamp: input.timestamp ?? Date.now(),
    teamName,
  };
};

// ── Eligibility ─────────────────────────────────────────────

const activeReplacementFor = (
  playerId: number,
  replacements: Replacement[]
): Replacement | undefined => replacements.find(r => r.replacementPlayerId === playerId);

const hasBeenReplaced = (playerId: number, replacements: Replacement[]): boolean =>
  replacements.some(r => r.originalPlayerId === playerId);

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
}

/** May this player bat? */
export const canBat = (playerId: number, replacements: Replacement[]): EligibilityResult => {
  if (hasBeenReplaced(playerId, replacements)) {
    return { allowed: false, reason: 'This player has been replaced and cannot bat' };
  }
  const repl = activeReplacementFor(playerId, replacements);
  if (!repl) return { allowed: true };
  if (!capabilitiesFor(repl.replacementType).bat) {
    return {
      allowed: false,
      reason: `${replacementLabel(repl.replacementType)}s are not permitted to bat`,
    };
  }
  return { allowed: true };
};

/** May this player bowl? */
export const canBowl = (playerId: number, replacements: Replacement[]): EligibilityResult => {
  if (hasBeenReplaced(playerId, replacements)) {
    return { allowed: false, reason: 'This player has been replaced and cannot bowl' };
  }
  const repl = activeReplacementFor(playerId, replacements);
  if (!repl) return { allowed: true };
  if (!capabilitiesFor(repl.replacementType).bowl) {
    return {
      allowed: false,
      reason: `${replacementLabel(repl.replacementType)}s are not permitted to bowl`,
    };
  }
  return { allowed: true };
};

/** May this player field? Substitutes always may. */
export const canField = (playerId: number, replacements: Replacement[]): EligibilityResult => {
  if (hasBeenReplaced(playerId, replacements)) {
    return { allowed: false, reason: 'This player has been replaced' };
  }
  return { allowed: true };
};

/** Throws if the player may not bat — for use on the incoming-batter path. */
export const assertCanBat = (playerId: number, replacements: Replacement[]): void => {
  const r = canBat(playerId, replacements);
  if (!r.allowed) throw new EngineError('INELIGIBLE_BATTER', r.reason ?? 'Player cannot bat');
};

/** Throws if the player may not bowl — for use on the bowler-change path. */
export const assertCanBowl = (playerId: number, replacements: Replacement[]): void => {
  const r = canBowl(playerId, replacements);
  if (!r.allowed) throw new EngineError('INELIGIBLE_BOWLER', r.reason ?? 'Player cannot bowl');
};

// ── Derived views ───────────────────────────────────────────

/** Status of every squad member, for the team sheet. */
export const buildPlayerStatuses = (
  squad: Array<{ id: number; teamName: string }>,
  playingXI: number[],
  replacements: Replacement[]
): PlayerStatusRecord[] =>
  squad.map(p => {
    const repl = activeReplacementFor(p.id, replacements);
    let status: PlayerMatchStatus;
    if (repl?.replacementType === 'CONCUSSION') status = 'CONCUSSION_REPLACEMENT';
    else if (repl) status = 'SUBSTITUTE';
    else if (playingXI.includes(p.id)) status = 'PLAYING_XI';
    else status = 'SUBSTITUTE';
    return { playerId: p.id, teamName: p.teamName, status };
  });

/** Scorecard annotation, e.g. "(concussion replacement for 7)". */
export const describeReplacement = (
  playerId: number,
  replacements: Replacement[],
  nameOf: (id: number) => string
): string | null => {
  const repl = activeReplacementFor(playerId, replacements);
  if (!repl) return null;
  return `${replacementLabel(repl.replacementType)} for ${nameOf(repl.originalPlayerId)}`;
};

/** Everyone currently off the field having been replaced. */
export const replacedPlayers = (replacements: Replacement[]): number[] =>
  replacements.map(r => r.originalPlayerId);

/** Everyone currently on as a replacement. */
export const activeReplacements = (replacements: Replacement[]): number[] =>
  replacements.map(r => r.replacementPlayerId);
