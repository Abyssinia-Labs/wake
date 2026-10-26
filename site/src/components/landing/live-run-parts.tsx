// The pieces of the hero's Wake for Mac window, drawn as WakeUI draws them
// (live-run.css): the band on the case with its keys, the day's runs on the
// left screen, the run's facts, and the keys under its screen.
import {
  bubble,
  cloud,
  creatureOf,
  type Sprite as SpriteData,
  spritePath,
} from "@/components/site/sprites";
import { GOING, HOST, LIVE, type ListRow, type RunStatus, TODAY, YESTERDAY } from "./live-run-data";

export function Sprite({ sprite, px }: { sprite: SpriteData; px: number }): React.JSX.Element {
  return (
    <svg
      width={sprite.width * px}
      height={sprite.height * px}
      viewBox={`0 0 ${sprite.width} ${sprite.height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path fill="currentColor" d={spritePath(sprite)} />
    </svg>
  );
}

/** A run's creature as its status shows it: a "!" while it waits, asleep when done, a cloud when it couldn't finish. */
export function Creature({
  name,
  status,
  px,
  lift,
}: {
  name: string;
  status: RunStatus;
  px: number;
  /** Pixels up, for the live run's bob and hop; others bob by CSS. */
  lift?: number;
}): React.JSX.Element {
  const moved = lift !== undefined;
  return (
    <span
      className={`lr-cr${status === "running" && !moved ? " lr-bob" : ""}`}
      style={{ "--px": px } as React.CSSProperties}
    >
      <span
        className="lr-spr"
        style={moved ? { transform: `translateY(${-lift * px}px)` } : undefined}
      >
        <Sprite sprite={creatureOf(name, status === "done")} px={px} />
      </span>
      {status === "waiting" && (
        <span className="lr-bang" style={{ right: -3 * px, top: -2 * px }}>
          <Sprite sprite={bubble} px={Math.max(1, px / 2)} />
        </span>
      )}
      {status === "done" && (
        <span className="lr-z" style={{ right: -2 * px, fontSize: 4 * px }}>
          z
        </span>
      )}
      {status === "failed" && (
        <span className="lr-cloud" style={{ top: -3 * px }}>
          <Sprite sprite={cloud} px={Math.max(1, px / 2)} />
        </span>
      )}
    </span>
  );
}

export function Band(): React.JSX.Element {
  return (
    <div className="lr-band">
      <div className="lr-lights">
        <i />
        <i />
        <i />
      </div>
      <div className="lr-mark">
        <span className="lr-wordmark">Wake</span>
        <span className="lr-grille" />
      </div>
      <div className="lr-secs">
        <span className="lr-key lr-on">
          Runs
          <span className="lr-blink">
            <Sprite sprite={bubble} px={1} />
          </span>
        </span>
        <span className="lr-key">Setup</span>
        <span className="lr-key">Settings</span>
      </div>
      <span className="lr-status">Listening for 1 app on {HOST}</span>
      <span className="lr-key">Pause</span>
    </div>
  );
}

function Row({
  row,
  selected,
  lift,
}: {
  row: ListRow;
  selected?: boolean;
  lift?: number;
}): React.JSX.Element {
  return (
    <div className={`lr-row${selected ? " lr-sel" : ""}`}>
      <Creature name={row.name} status={row.status} px={2} lift={lift} />
      <div className="lr-who">
        <span className="lr-nm">{row.name}</span>
        <span className="lr-sub">{row.said}</span>
        <span className="lr-sub">in GitHub</span>
      </div>
      <span className="lr-time">{row.time}</span>
    </div>
  );
}

/** The day's runs: the live one under Going now, then under Today once done. */
export function RunList({
  done,
  minutes,
  lift,
}: {
  done: boolean;
  minutes: number;
  lift: number;
}): React.JSX.Element {
  const live: ListRow = done
    ? { name: LIVE.name, status: "done", said: `Done: ${LIVE.ref}`, time: LIVE.ended }
    : { name: LIVE.name, status: "running", said: `On it: ${LIVE.ref}`, time: `${minutes} min` };
  const groups: [string, ListRow[]][] = [
    ["Going now", done ? GOING : [live, ...GOING]],
    ["Today", done ? [live, ...TODAY] : TODAY],
    ["Yesterday", YESTERDAY],
  ];
  return (
    <div className="lr-list">
      {groups.map(([title, rows]) => (
        <div key={title}>
          <div className="lr-sh">{title}</div>
          {rows.map((row) => (
            <Row
              key={row.name}
              row={row}
              selected={row.name === LIVE.name}
              lift={row.name === LIVE.name && !done ? lift : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const CLAUDE =
  "M20.998 10.949H24V14.051H21V17.079H19.513V20H18V17.079H16.513V20H15V17.079H9V20H7.488V17.079H6V20H4.487V17.079H3V14.05H0V10.95H3V5H20.998V10.949ZM6 10.949H7.488V8.102H6V10.949ZM16.51 10.949H18V8.102H16.51V10.949Z";

export function Facts(): React.JSX.Element {
  const fact = (
    label: string,
    value: React.ReactNode,
    extra?: React.ReactNode,
  ): React.JSX.Element => (
    <div className="lr-fact">
      <span className="lr-lab">{label}</span>
      <span className="lr-val">{value}</span>
      {extra}
    </div>
  );
  return (
    <>
      <div className="lr-sh">Facts</div>
      <div className="lr-facts">
        {fact("Asked", `${LIVE.ref}, in ${LIVE.app}, at ${LIVE.started}`)}
        {fact(
          "Tool",
          <>
            <svg className="lr-toolmark" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" fillRule="evenodd" d={CLAUDE} />
            </svg>
            Claude Code
          </>,
        )}
        {fact("Repository", LIVE.repository)}
        {fact("Worktree", LIVE.worktree)}
        {fact("Resume", LIVE.resume, <span className="lr-copy">Copy</span>)}
      </div>
    </>
  );
}

/** The keys under the run's screen, for a run going and once it's done. */
export function Keys({ done }: { done: boolean }): React.JSX.Element {
  return (
    <div className="lr-keys">
      {done && <span className="lr-key">Open in Terminal</span>}
      <span className="lr-key">Show in Finder</span>
      <span className="lr-key">Open in GitHub</span>
      {!done && <span className="lr-key lr-push">Stop run…</span>}
    </div>
  );
}
