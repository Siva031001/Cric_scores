const DISMISSAL_LABELS = {
  BOWLED: 'Bowled',
  CAUGHT: 'Caught',
  CAUGHT_AND_BOWLED: 'Caught & Bowled',
  LBW: 'LBW',
  RUN_OUT: 'Run Out',
  STUMPED: 'Stumped',
  HIT_WICKET: 'Hit Wicket',
  HIT_BALL_TWICE: 'Hit the Ball Twice',
  OBSTRUCTING_FIELD: 'Obstructing the Field',
  TIMED_OUT: 'Timed Out',
  RETIRED_OUT: 'Retired Out',
};

export default function EventGraphic({ event }) {
  const { type, payload, key } = event;

  if (type === 'FOUR' || type === 'SIX') {
    return (
      <div key={key} className={`ov__event ov__event--${type.toLowerCase()}`}>
        <div className="ov__eventTitle">{type}!</div>
        <div className="ov__eventName">{payload.name}</div>
      </div>
    );
  }

  if (type === 'WICKET') {
    return (
      <div key={key} className="ov__event ov__event--wicket">
        <div className="ov__eventTitle">WICKET!</div>
        <div className="ov__eventName">{payload.name} — OUT</div>
        {payload.dismissalType && (
          <div className="ov__eventSub">{DISMISSAL_LABELS[payload.dismissalType] ?? payload.dismissalType}</div>
        )}
        {payload.fielderName && <div className="ov__eventSub">by {payload.fielderName}</div>}
      </div>
    );
  }

  if (type === 'OVER_COMPLETE') {
    return (
      <div key={key} className="ov__event ov__event--over">
        <div className="ov__eventTitle">OVER {payload.overs}</div>
      </div>
    );
  }

  if (type === 'MILESTONE') {
    return (
      <div key={key} className="ov__event ov__event--milestone">
        <div className="ov__eventTitle">{payload.text}</div>
        {payload.playerName && <div className="ov__eventName">{payload.playerName}</div>}
      </div>
    );
  }

  if (type === 'RESULT') {
    return (
      <div key={key} className="ov__event ov__event--result ov__event--persistent">
        <div className="ov__eventTitle">MATCH RESULT</div>
        <div className="ov__eventName">{payload.result?.text}</div>
        {payload.mom?.name && (
          <div className="ov__eventSub">Player of the Match: {payload.mom.name}</div>
        )}
      </div>
    );
  }

  return null;
}
