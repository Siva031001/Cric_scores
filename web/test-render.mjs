import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: 'ssr', hmr: false }, appType: 'custom' });
const { default: Overlay } = await server.ssrLoadModule('/src/Overlay.jsx');

const baseMatch = {
  team1: 'Chennai Kings', team2: 'Madurai XI',
  team1Logo: null, team2Logo: null,
  totalOvers: 20,
  currentInnings: 1,
  team1Players: [{ id: 0, name: 'Raja' }, { id: 1, name: 'Kumar' }, { id: 2, name: 'Vijay' }],
  team2Players: [{ id: 10, name: 'Arun' }, { id: 11, name: 'Suresh' }],
  status: 'live',
  innings1: {
    runs: 145, wickets: 4, overs: 17, balls: 2,
    strikerId: 0, nonStrikerId: 1, currentBowlerId: 10,
    batsmanStats: {
      p0: { runs: 62, balls: 43, fours: 5, sixes: 2, isOut: false },
      p1: { runs: 21, balls: 17, fours: 1, sixes: 0, isOut: false },
    },
    bowlerStats: { p10: { overs: 3, balls: 2, maidens: 0, runs: 24, wickets: 2 } },
    ballHistory: [
      { result: '1' }, { result: '4' }, { result: 'W', over: 10, ball: 3, batsmanId: 2, fielderName: 'Arun' },
      { result: '6' }, { result: '1' },
    ],
  },
  innings2: null,
};

const chasingMatch = {
  ...baseMatch,
  currentInnings: 2,
  innings2: {
    ...baseMatch.innings1,
    runs: 100, wickets: 2, overs: 15, balls: 0,
    batsmanStats: { p0: { runs: 40, balls: 30, fours: 3, sixes: 1, isOut: false }, p1: { runs: 20, balls: 15, fours: 2, sixes: 0, isOut: false } },
  },
};

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + label + (extra ? ' ' + extra : ''));
  if (!ok) failures++;
};

const render = (match, opts = {}) =>
  renderToStaticMarkup(
    React.createElement(Overlay, { match, themeId: 'classic', layout: 'full', hidden: [], sponsorText: '', sponsorLogo: '', tournamentName: 'Summer Cup', connectionLost: false, ...opts })
  );

const h1 = render(baseMatch);
['145/4', '17.2', 'Raja', '62', '43', 'Kumar', '21', 'Arun', '3.2-0-24-2', 'Chennai Kings', 'Summer Cup'].forEach((s) =>
  check('1st innings contains "' + s + '"', h1.includes(s))
);
check('1st innings hides target/RRR', !h1.includes('TGT'));
// Structural, not just substring — catches a striker/non-striker (or
// batter/bowler) figures mixup that plain .includes() checks would miss,
// since every individual number would still be present SOMEWHERE in the
// document even if attached to the wrong name.
check('striker Raja is paired with HIS OWN figures, not swapped with Kumar', /Raja<\/span><span class="ov__batterFigs">62 \(43\)/.test(h1));
check('non-striker Kumar is paired with HIS OWN figures, not swapped with Raja', /Kumar<\/span><span class="ov__batterFigs">21 \(17\)/.test(h1));
check('bowler Arun is paired with his own figures', /Arun<\/span><span class="ov__bowlerFigs">3\.2-0-24-2/.test(h1));

const h2 = render(chasingMatch);
['100/2', '15.0', 'TGT 146', 'NEED 46', 'RRR'].forEach((s) => check('chase contains "' + s + '"', h2.includes(s)));

const h3 = render(baseMatch, { layout: 'bar' });
check('bar layout omits bowler block', !h3.includes('ov__bowler'));
check('bar layout omits branding block', !h3.includes('ov__brand'));

const h4 = render(baseMatch, { hidden: ['partnership', 'fow'] });
check('hide= suppresses partnership', !h4.includes('ov__partnership'));
check('hide= suppresses fow', !h4.includes('ov__fow'));

const notOpen = { ...baseMatch, currentInnings: 2, innings2: { ...baseMatch.innings1, strikerId: -1, nonStrikerId: -2 } };
const h5 = render(notOpen, { tournamentName: '' });
check('2nd innings not yet open renders nothing', h5 === '', 'got: ' + JSON.stringify(h5));

// A retirement never appears in ballHistory (src/engine/reduce.ts only
// pushes a BALL kind there) — the innings' real `wickets` count is the only
// place it shows up. FOW must still list it (as "ret", not silently
// dropped), and partnership must flag itself approximate.
const withRetirement = {
  ...baseMatch,
  innings1: {
    ...baseMatch.innings1,
    wickets: 5, // one more than ballHistory's single "W" token accounts for
    retired: [{ playerId: 2, type: 'RETIRED_HURT', returned: false }],
  },
};
const h6 = render(withRetirement);
check('FOW lists a retirement it cannot see in ballHistory, instead of dropping it', /4-ret/.test(h6));
check('partnership is marked approximate while a retirement is unresolved', h6.includes('~Raja'));

console.log();
console.log(failures === 0 ? 'ALL RENDER TESTS PASSED' : failures + ' RENDER TEST(S) FAILED');
await server.close();
process.exit(failures === 0 ? 0 : 1);
