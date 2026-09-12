import { useEffect, useRef, useState } from 'react';
import { onValue, ref, get } from 'firebase/database';
import { db } from './firebase';
import Overlay from './Overlay';

function readQueryParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    matchId: (p.get('m') || p.get('matchId') || '').trim(),
    themeId: p.get('theme') || null,
    layout: p.get('layout') || 'full',
    // Everything shows by default; ?hide=batsmen,bowler,partnership,fow,logo,sponsor opts specific blocks out.
    hidden: (p.get('hide') || '').split(',').map((s) => s.trim()).filter(Boolean),
    sponsorText: p.get('sponsorText') || '',
    sponsorLogo: p.get('sponsorLogo') || '',
  };
}

export default function App() {
  const [params] = useState(readQueryParams);
  const { matchId, themeId, layout, hidden, sponsorText, sponsorLogo } = params;
  const [match, setMatch] = useState(null);
  const [status, setStatus] = useState(matchId ? 'connecting' : 'missing-id');
  const [tournamentName, setTournamentName] = useState('');
  // Firebase's own listener already survives brief network blips and
  // replays the last value on reconnect, but if it genuinely errors out we
  // keep showing the last good snapshot rather than blanking to zeros.
  const lastGoodMatch = useRef(null);
  // A per-path onValue's error callback only fires for an unrecoverable
  // listener error (e.g. permission denied) — NOT for ordinary network
  // loss, which the SDK handles silently with automatic reconnect and no
  // callback at all. Realtime Database's special .info/connected path is
  // the documented way to actually observe the client-server connection
  // state, so that's what drives the "Reconnecting…" banner.
  const [connected, setConnected] = useState(true);
  const everConnectedRef = useRef(false);

  useEffect(() => {
    const connectedRef = ref(db, '.info/connected');
    const unsub = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      if (isConnected) everConnectedRef.current = true;
      setConnected(isConnected);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!matchId) return;
    const matchRef = ref(db, 'matches/' + matchId);
    const unsub = onValue(
      matchRef,
      (snap) => {
        const val = snap.val();
        if (val) {
          lastGoodMatch.current = val;
          setMatch(val);
          setStatus('ok');
        } else {
          setStatus('not-found');
        }
      },
      () => setStatus('disconnected')
    );
    // Properly unsubscribed on unmount — this is the ONLY per-match
    // Firebase listener this whole app opens, scoped to exactly one match,
    // never the full matches collection.
    return () => unsub();
  }, [matchId]);

  // Tournament name: a one-time read, not a live listener — it does not
  // change mid-match, so there is no reason to keep a socket open for it.
  useEffect(() => {
    if (!match?.tournamentId) return;
    get(ref(db, 'tournaments/' + match.tournamentId + '/name'))
      .then((snap) => setTournamentName(snap.val() || ''))
      .catch(() => {});
  }, [match?.tournamentId]);

  if (!matchId) {
    return (
      <div style={{ color: '#fff', fontFamily: 'monospace', padding: 12 }}>
        Add ?m=&lt;matchId&gt; to this URL (e.g. ?m=AB1234&amp;theme=classic).
      </div>
    );
  }
  if (status === 'connecting' && !match) {
    // An OBS Browser Source should show nothing while first connecting —
    // not a spinner, since a spinner would itself become part of the
    // recorded broadcast if the stream starts before the match is scored.
    return null;
  }
  if (status === 'not-found') {
    return (
      <div style={{ color: '#fff', fontFamily: 'monospace', padding: 12, background: 'rgba(0,0,0,0.6)', borderRadius: 6 }}>
        Match "{matchId}" not found.
      </div>
    );
  }

  const shown = lastGoodMatch.current ?? match;
  if (!shown) return null;

  return (
    <Overlay
      match={shown}
      themeId={themeId}
      layout={layout}
      hidden={hidden}
      sponsorText={sponsorText}
      sponsorLogo={sponsorLogo}
      tournamentName={tournamentName}
      connectionLost={status === 'disconnected' || (everConnectedRef.current && !connected)}
    />
  );
}
