import {
  statKey,
  getOversString,
  getRunRate,
  getRequiredRunRate,
  getEconomyRate,
  ballsRemaining,
  currentPartnership,
  fallOfWickets,
  nameOf,
} from './formulas';
import { getTheme } from './theme';
import { useMatchEvents } from './useMatchEvents';
import EventGraphic from './EventGraphic';
import './Overlay.css';

/**
 * Renders ONLY graphics. Every number here is read straight off
 * matches/{matchId} (or derived from it with the pure formulas in
 * formulas.js) — nothing is decided here, only displayed.
 */
export default function Overlay({
  match,
  themeId,
  layout,
  hidden,
  sponsorText,
  sponsorLogo,
  tournamentName,
  connectionLost,
}) {
  const theme = getTheme(themeId);
  const event = useMatchEvents(match);
  const show = (key) => !hidden.includes(key);

  const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
  if (!inn || inn.strikerId === -1) {
    // 2nd innings not opened yet, or some other not-yet-ready state — show
    // nothing rather than a broken/zeroed graphic.
    return null;
  }

  const battingTeamName = match.currentInnings === 1 ? match.team1 : match.team2;
  const battingLogo = match.currentInnings === 1 ? match.team1Logo : match.team2Logo;
  const batP = match.currentInnings === 1 ? match.team1Players : match.team2Players;
  const bolP = match.currentInnings === 1 ? match.team2Players : match.team1Players;

  const target = match.currentInnings === 2 ? (match.innings1?.runs ?? 0) + 1 : null;
  const ss = inn.batsmanStats?.[statKey(inn.strikerId)];
  const ns = inn.batsmanStats?.[statKey(inn.nonStrikerId)];
  const bws = inn.bowlerStats?.[statKey(inn.currentBowlerId)];
  const hasActiveRetirement = (inn.retired ?? []).some((r) => !r.returned);
  const partnership = currentPartnership(inn.ballHistory, hasActiveRetirement);
  const fow = fallOfWickets(inn.ballHistory, inn.wickets);

  const vars = {
    '--ov-primary': theme.primary,
    '--ov-secondary': theme.secondary,
    '--ov-text': theme.text,
    '--ov-accent': theme.accent,
  };

  return (
    <div className={`ov ov--${layout}`} style={vars}>
      {connectionLost && <div className="ov__connLost">Reconnecting…</div>}

      {layout === 'full' && show('logo') && (tournamentName || match.team1) && (
        <div className="ov__brand">
          {tournamentName && <span className="ov__brandTournament">{tournamentName}</span>}
          <span className="ov__brandMatch">{match.team1} vs {match.team2}</span>
        </div>
      )}

      <div className="ov__scoreBar">
        <div className="ov__teamScore">
          {battingLogo && <img className="ov__teamLogo" src={battingLogo} alt="" />}
          <span className="ov__teamName">{battingTeamName}</span>
          <span className="ov__score">{inn.runs ?? 0}/{inn.wickets ?? 0}</span>
          <span className="ov__overs">({getOversString(inn.overs, inn.balls)})</span>
        </div>
        <div className="ov__meta">
          <span>CRR {getRunRate(inn.runs, inn.overs, inn.balls)}</span>
          {target != null && (
            <>
              <span className="ov__accent">TGT {target}</span>
              <span className="ov__accent">NEED {Math.max(0, target - (inn.runs ?? 0))}</span>
              <span>BALLS {ballsRemaining(match.totalOvers, inn.overs, inn.balls)}</span>
              <span className="ov__accent">RRR {getRequiredRunRate(target, inn.runs, match.totalOvers, inn.overs, inn.balls)}</span>
            </>
          )}
        </div>
      </div>

      {layout === 'full' && (
        <>
          {show('batsmen') && (
            <div className="ov__batsmen">
              <div className="ov__batterRow">
                <span className="ov__strikeDot">▶</span>
                <span className="ov__batterName">{nameOf(batP, inn.strikerId)}</span>
                <span className="ov__batterFigs">{ss?.runs ?? 0} ({ss?.balls ?? 0})</span>
              </div>
              <div className="ov__batterRow ov__batterRow--sub">
                <span className="ov__strikeDot" />
                <span className="ov__batterName">{nameOf(batP, inn.nonStrikerId)}</span>
                <span className="ov__batterFigs">{ns?.runs ?? 0} ({ns?.balls ?? 0})</span>
              </div>
            </div>
          )}

          {show('bowler') && (
            <div className="ov__bowler">
              <span className="ov__bowlerName">{nameOf(bolP, inn.currentBowlerId)}</span>
              <span className="ov__bowlerFigs">
                {bws?.overs ?? 0}.{bws?.balls ?? 0}-{bws?.maidens ?? 0}-{bws?.runs ?? 0}-{bws?.wickets ?? 0}
              </span>
              <span className="ov__bowlerEco">Eco {getEconomyRate(bws?.runs ?? 0, bws?.overs ?? 0, bws?.balls ?? 0)}</span>
            </div>
          )}

          {show('partnership') && partnership.balls > 0 && (
            <div className="ov__partnership">
              {partnership.approximate ? '~' : ''}
              {nameOf(batP, inn.strikerId)} &amp; {nameOf(batP, inn.nonStrikerId)}: {partnership.runs} ({partnership.balls})
            </div>
          )}

          {show('fow') && fow.length > 0 && (
            <div className="ov__fow">
              <span className="ov__fowLabel">FOW</span>
              {fow.map((w) => (
                <span key={w.wicketNumber} className="ov__fowItem">
                  {w.wicketNumber}-{w.retired ? 'ret' : w.score}
                </span>
              ))}
            </div>
          )}

          {show('sponsor') && (sponsorText || sponsorLogo) && (
            <div className="ov__sponsor">
              {sponsorLogo && <img className="ov__sponsorLogo" src={sponsorLogo} alt="" />}
              {sponsorText && <span>{sponsorText}</span>}
            </div>
          )}
        </>
      )}

      {event && <EventGraphic event={event} />}
    </div>
  );
}
