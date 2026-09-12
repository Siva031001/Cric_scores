// Pure-function tests for formulas.js — no React/DOM needed. Run directly
// with `node test-formulas.mjs` (or `npm test`, which runs this + the
// render tests).
import * as f from './src/formulas.js';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + label + ' -> ' + JSON.stringify(actual) + (ok ? '' : ' expected ' + JSON.stringify(expected)));
  if (!ok) failures++;
};

check('statKey', f.statKey(5), 'p5');
check('oversString', f.getOversString(3, 2), '3.2');
check('runRate', f.getRunRate(30, 5, 0), '6.00');
check('runRate zero overs', f.getRunRate(0, 0, 0), '0.00');
check('requiredRunRate', f.getRequiredRunRate(150, 100, 20, 15, 0), '10.00');
check('requiredRunRate reached', f.getRequiredRunRate(150, 150, 20, 15, 0), '0.00');
check('ballsRemaining', f.ballsRemaining(20, 18, 3), 9);

// ── runsFromResult / isWicketResult / isLegalDelivery ──
check('runsFromResult plain', f.runsFromResult('4'), 4);
check('runsFromResult wicket', f.runsFromResult('W'), 0);
check('runsFromResult wicket RO no runs', f.runsFromResult('W(RO)'), 0);
check('runsFromResult wicket RO with runs', f.runsFromResult('2W(RO)'), 2);
check('runsFromResult wide bare', f.runsFromResult('WD'), 1);
check('runsFromResult wide extra', f.runsFromResult('WD2'), 3);
check('runsFromResult no-ball bare', f.runsFromResult('NB'), 1);
check('runsFromResult no-ball extra', f.runsFromResult('NB4'), 5);
check('runsFromResult leg-bye', f.runsFromResult('LB1'), 1);
check('runsFromResult bye', f.runsFromResult('B2'), 2);
check('runsFromResult penalty with amount', f.runsFromResult('PEN5'), 5);
check('runsFromResult penalty bare', f.runsFromResult('PEN'), 5);
check('runsFromResult penalty other amount', f.runsFromResult('PEN7'), 7);
check('runsFromResult non-string', f.runsFromResult(undefined), 0);

check('isWicketResult W', f.isWicketResult('W'), true);
check('isWicketResult W(RO)', f.isWicketResult('W(RO)'), true);
check('isWicketResult nW(RO)', f.isWicketResult('2W(RO)'), true);
check('isWicketResult WD is NOT a wicket', f.isWicketResult('WD'), false);
check('isWicketResult WD2 is NOT a wicket', f.isWicketResult('WD2'), false);
check('isWicketResult plain run', f.isWicketResult('4'), false);

check('isLegalDelivery plain run', f.isLegalDelivery({ result: '4' }), true);
check('isLegalDelivery wide is not legal', f.isLegalDelivery({ result: 'WD2' }), false);
check('isLegalDelivery no-ball is not legal', f.isLegalDelivery({ result: 'NB1' }), false);
check('isLegalDelivery penalty is not legal (not a delivery at all)', f.isLegalDelivery({ result: 'PEN5' }), false);
check('isLegalDelivery NEW_BATSMAN marker is not legal', f.isLegalDelivery({ type: 'NEW_BATSMAN' }), false);
check('isLegalDelivery bye IS legal', f.isLegalDelivery({ result: 'B1' }), true);

// ── currentPartnership ──
check(
  'partnership: sums since last wicket, byes count as legal balls',
  f.currentPartnership([{ result: '1' }, { result: '4' }, { result: 'W' }, { result: '0' }, { result: '6' }, { result: 'B1' }]),
  { runs: 7, balls: 3, approximate: false }
);
check(
  'partnership: a scored run-out closes the old pair, crediting its runs first',
  f.currentPartnership([{ result: '1' }, { result: '2W(RO)' }, { result: '4' }, { result: '1' }]),
  { runs: 5, balls: 2, approximate: false }
);
check(
  'partnership: PEN runs count toward the total but never consume a ball',
  f.currentPartnership([{ result: 'W' }, { result: '1' }, { result: 'PEN5' }, { result: '2' }]),
  { runs: 8, balls: 2, approximate: false }
);
check(
  'partnership: approximate flag passed through when a retirement is active',
  f.currentPartnership([{ result: '1' }], true),
  { runs: 1, balls: 1, approximate: true }
);

// ── fallOfWickets ──
check(
  'fow: basic sequence',
  f.fallOfWickets([{ result: '1' }, { result: '4' }, { result: 'W', over: 2, ball: 3 }, { result: '2' }, { result: 'W(RO)', over: 5, ball: 1 }]),
  [
    { wicketNumber: 1, score: 5, over: '2.4', retired: false },
    { wicketNumber: 2, score: 7, over: '5.2', retired: false },
  ]
);
check(
  'fow: a retirement (missing from ballHistory entirely) is appended using the real wicket count, not silently dropped',
  f.fallOfWickets([{ result: '1' }, { result: 'W', over: 2, ball: 3 }], 3),
  [
    { wicketNumber: 1, score: 1, over: '2.4', retired: false },
    { wicketNumber: 2, score: null, over: null, retired: true },
    { wicketNumber: 3, score: null, over: null, retired: true },
  ]
);
check(
  'fow: without a totalWickets hint, no retirement entries are fabricated',
  f.fallOfWickets([{ result: '1' }, { result: 'W', over: 2, ball: 3 }]),
  [{ wicketNumber: 1, score: 1, over: '2.4', retired: false }]
);

// ── nameOf ──
check('nameOf found', f.nameOf([{ id: 0, name: 'Raja' }], 0), 'Raja');
check('nameOf fallback', f.nameOf([{ id: 0, name: 'Raja' }], 5), 'P6');

// ── regression guard: a striker/non-striker mixup would break this ──
// (Overlay.jsx must read batsmanStats[statKey(strikerId)] for the striker
// row and [statKey(nonStrikerId)] for the other — statKey itself doesn't
// enforce that, so this just re-confirms the key format callers rely on.)
check('statKey format used to index batsmanStats/bowlerStats', f.statKey(0), 'p0');
check('statKey format is distinct per id', f.statKey(1) !== f.statKey(0), true);

console.log();
console.log(failures === 0 ? 'ALL FORMULA TESTS PASSED' : failures + ' FORMULA TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
