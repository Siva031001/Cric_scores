// ─────────────────────────────────────────────────────────────
// EVENT HISTORY — undo, edit, delete, replay
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// Every correction is expressed as a change to the EVENT LOG, never as a
// patch to a displayed total. The caller then re-folds the log:
//
//   edit / delete / undo  ->  MatchEvent[]  ->  reduceInnings()  ->  state
//
// That is what guarantees runs, wickets, overs, strike, bowler figures,
// batter figures, extras, partnerships, the result and the NRR inputs all
// stay consistent with each other. There is no code path that adjusts one
// of those without recomputing the rest.
// ─────────────────────────────────────────────────────────────

import { CreaseSlot, EngineError, MatchEvent, isBallEvent } from './types';

/** Bookkeeping events that accompany a delivery rather than standing alone. */
const isBookkeeping = (e: MatchEvent): boolean =>
  e.kind === 'NEW_BATSMAN' || e.kind === 'BOWLER_CHANGE';

const bySeq = (a: MatchEvent, b: MatchEvent) => a.seq - b.seq;

/** Renumbers seq to be contiguous from 0, preserving order. */
export const resequence = (events: MatchEvent[]): MatchEvent[] =>
  [...events].sort(bySeq).map((e, i) => ({ ...e, seq: i }));

export const nextSeq = (events: MatchEvent[]): number =>
  events.reduce((max, e) => Math.max(max, e.seq), -1) + 1;

/** Appends an event, assigning the next sequence number. */
export const appendEvent = (events: MatchEvent[], event: MatchEvent): MatchEvent[] => [
  ...events,
  { ...event, seq: nextSeq(events) },
];

export interface UndoResult {
  events: MatchEvent[];
  removed: MatchEvent[];
}

/**
 * Undoes the last scoring action.
 *
 * Trailing bookkeeping events are removed together with the delivery they
 * belong to, so one Undo after a wicket reverses BOTH the incoming batter
 * and the wicket itself — leaving the dismissed batter back at the crease
 * as though the ball never happened.
 */
export const undoLast = (events: MatchEvent[]): UndoResult => {
  const out = [...events].sort(bySeq);
  const removed: MatchEvent[] = [];

  while (out.length > 0 && isBookkeeping(out[out.length - 1])) {
    removed.unshift(out.pop() as MatchEvent);
  }
  if (out.length > 0) {
    removed.unshift(out.pop() as MatchEvent);
  }

  return { events: resequence(out), removed };
};

export interface EditAudit {
  editedBy?: string | null;
  editedAt?: number;
  reason?: string | null;
}

/** Strips audit fields so nested editedFrom chains cannot grow unbounded. */
const stripAudit = (e: MatchEvent): MatchEvent => {
  const { editedFrom, editedBy, editedAt, editReason, ...rest } = e as MatchEvent & {
    editedFrom?: unknown;
  };
  return rest as MatchEvent;
};

/**
 * Replaces the event at `targetSeq` with a new one, keeping its position in
 * the log and recording what it used to be.
 *
 * The replacement must already have been produced by deriveEvent(), so it
 * has been validated. The caller re-folds afterwards.
 */
export const editEvent = (
  events: MatchEvent[],
  targetSeq: number,
  replacement: MatchEvent,
  audit: EditAudit = {}
): MatchEvent[] => {
  const target = events.find(e => e.seq === targetSeq);
  if (!target) {
    throw new EngineError('NOT_FOUND', `No event at position ${targetSeq} to edit`);
  }
  return [...events]
    .sort(bySeq)
    .map(e =>
      e.seq === targetSeq
        ? ({
            ...replacement,
            id: e.id,
            seq: targetSeq,
            inningsKey: e.inningsKey,
            editedFrom: stripAudit(target),
            editedBy: audit.editedBy ?? null,
            editedAt: audit.editedAt ?? Date.now(),
            editReason: audit.reason ?? null,
          } as MatchEvent)
        : e
    );
};

/**
 * Removes the event at `targetSeq` entirely — for a delivery logged that
 * never happened. Sequence numbers are closed up so the log stays dense.
 */
export const deleteEvent = (events: MatchEvent[], targetSeq: number): MatchEvent[] => {
  const target = events.find(e => e.seq === targetSeq);
  if (!target) {
    throw new EngineError('NOT_FOUND', `No event at position ${targetSeq} to delete`);
  }
  return resequence(events.filter(e => e.seq !== targetSeq));
};

/** Inserts an event at a position, shifting later events down. */
export const insertEventAt = (
  events: MatchEvent[],
  atSeq: number,
  event: MatchEvent
): MatchEvent[] => {
  const before = events.filter(e => e.seq < atSeq);
  const after = events.filter(e => e.seq >= atSeq);
  return resequence([...before, { ...event, seq: atSeq - 0.5 }, ...after]);
};

// ── Selection helpers for the edit UI ───────────────────────

export interface DeliveryRef {
  seq: number;
  over: number;
  ball: number;
  /** "5.3" — the over.ball label a scorer recognises. */
  label: string;
  description: string;
}

/**
 * Lists the deliveries in an innings so the scorer can pick one to edit.
 * Bookkeeping events are hidden — they are not deliveries.
 */
export const listDeliveries = (events: MatchEvent[]): DeliveryRef[] =>
  [...events]
    .sort(bySeq)
    .filter(isBallEvent)
    .map(e => {
      const parts: string[] = [];
      if (e.deliveryType === 'WIDE') parts.push(`Wide +${e.extras.wide}`);
      else if (e.deliveryType === 'NO_BALL') parts.push(`No ball +${e.totalRuns}`);
      else if (e.extras.bye > 0) parts.push(`${e.extras.bye} bye`);
      else if (e.extras.legBye > 0) parts.push(`${e.extras.legBye} leg bye`);
      else parts.push(`${e.batterRuns} run${e.batterRuns === 1 ? '' : 's'}`);
      if (e.wicket) parts.push(e.wicket.type.toLowerCase().replace(/_/g, ' '));
      if (e.shortRuns) parts.push(`${e.shortRuns} short`);
      return {
        seq: e.seq,
        over: e.over,
        ball: e.ball,
        // Ball is zero-based within the over internally; display it 1-based.
        label: `${e.over}.${e.ball + 1}`,
        description: parts.join(', '),
      };
    });

/** True when the event at this position has been edited. */
export const wasEdited = (events: MatchEvent[], seq: number): boolean => {
  const e = events.find(x => x.seq === seq);
  return !!(e && (e as { editedFrom?: unknown }).editedFrom);
};

/** Full audit trail of every edited event, for review. */
export interface AuditEntry {
  seq: number;
  editedBy: string | null;
  editedAt: number | null;
  reason: string | null;
  before: MatchEvent;
  after: MatchEvent;
}

export const auditTrail = (events: MatchEvent[]): AuditEntry[] =>
  [...events]
    .sort(bySeq)
    .filter(e => (e as { editedFrom?: unknown }).editedFrom)
    .map(e => ({
      seq: e.seq,
      editedBy: e.editedBy ?? null,
      editedAt: e.editedAt ?? null,
      reason: e.editReason ?? null,
      before: (e as { editedFrom: MatchEvent }).editedFrom,
      after: stripAudit(e),
    }));

// ── Split / merge by innings ────────────────────────────────

export const eventsForInnings = (events: MatchEvent[], inningsKey: string): MatchEvent[] =>
  [...events].filter(e => e.inningsKey === inningsKey).sort(bySeq);

/**
 * Groups a flat event log by innings key. Super Over events use namespaced
 * keys, so this is what keeps them out of the regulation innings fold.
 */
export const groupByInnings = (events: MatchEvent[]): Record<string, MatchEvent[]> => {
  const out: Record<string, MatchEvent[]> = {};
  for (const e of [...events].sort(bySeq)) {
    if (!out[e.inningsKey]) out[e.inningsKey] = [];
    out[e.inningsKey].push(e);
  }
  return out;
};

/** The crease slot a wicket left empty, for the incoming-batter prompt. */
export const vacantSlotAfter = (events: MatchEvent[]): CreaseSlot | null => {
  const ordered = [...events].sort(bySeq);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const e = ordered[i];
    if (e.kind === 'NEW_BATSMAN' || e.kind === 'RETURN_TO_BAT') return null;
    if (isBallEvent(e) && e.wicket?.countsAsWicket) {
      return e.wicket.playerOutId === e.nonStrikerId ? 'nonStriker' : 'striker';
    }
    if (e.kind === 'RETIREMENT') return null;
  }
  return null;
};
