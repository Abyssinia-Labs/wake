// The landing hero's art: Wake at work, drawn as each theme draws it (the
// apps' brief, "The look"), and shown only while its theme is on. The same
// moment in all three: one run on it, an ask that needs you, one done.
// Rendered to HTML at build; hero.css draws and moves it.
import {
  bubble,
  egg,
  heron,
  otterAsleep,
  type Sprite as SpriteData,
  spritePath,
} from "@/components/site/sprites";

const SAID = "Wake at work: amber-heron is on it, an ask needs you, and quiet-otter is done.";

function Sprite({
  sprite,
  scale,
  className,
}: {
  sprite: SpriteData;
  scale: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={sprite.width * scale}
      height={sprite.height * scale}
      viewBox={`0 0 ${sprite.width} ${sprite.height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path fill="currentColor" d={spritePath(sprite)} />
    </svg>
  );
}

/** Burrow: Wake for Mac's runs on the small screen in the orange case. */
function Burrow(): React.JSX.Element {
  return (
    <div className="hero-art for-theme for-burrow" role="img" aria-label={SAID}>
      <div className="bw-case">
        <div className="bw-screen">
          <div className="bw-head">
            <span>Wake</span>
            <span>1 running</span>
          </div>
          <ul className="bw-rows">
            <li>
              <Sprite sprite={heron} scale={3} className="bw-awake" />
              <span>
                <b>amber-heron</b>
                <small>on it · acme/api #812</small>
              </span>
            </li>
            <li className="bw-needs">
              <span className="bw-egg">
                <Sprite sprite={egg} scale={3} />
                <Sprite sprite={bubble} scale={2} className="bw-bubble bw-blink" />
              </span>
              <span>
                <b>needs you</b>
                <small>which branch? · acme/web</small>
              </span>
            </li>
            <li>
              <Sprite sprite={otterAsleep} scale={3} />
              <span>
                <b>quiet-otter</b>
                <small>done · opened #431</small>
              </span>
            </li>
          </ul>
        </div>
        <div className="bw-foot">
          <span className="bw-grille" />
          <span className="bw-key">Open</span>
          <span className="bw-key">Pause</span>
        </div>
      </div>
    </div>
  );
}

/** Annunciator: the caution panel, its lamps lit only where they mean something. */
function Annunciator(): React.JSX.Element {
  const lamps = [
    { n: "1", legend: "Running", lit: "g" },
    { n: "1", legend: "Needs you", lit: "a" },
    { n: "1", legend: "Machine", lit: "w" },
    { n: "0", legend: "Failed" },
    { n: "0", legend: "Paused" },
    { n: "0", legend: "Can’t reach" },
  ];
  return (
    <div className="hero-art for-theme for-annunciator" role="img" aria-label={SAID}>
      <div className="an-housing">
        <div className="an-plate">
          <span>Wake</span>
          <span>Listening</span>
        </div>
        <ul className="an-grid">
          {lamps.map(({ n, legend, lit }) => (
            <li key={legend} className="an-lamp" data-lit={lit}>
              <span className="an-lamp-n">{n}</span>
              <span>{legend}</span>
            </li>
          ))}
        </ul>
        <ul className="an-runs">
          <li>
            <span className="an-pip" data-lit="g" />
            <b>amber-heron</b>
            <span>On it</span>
          </li>
          <li>
            <span className="an-pip" data-lit="a" />
            <b>acme/web</b>
            <span>Needs you</span>
          </li>
          <li>
            <span className="an-pip" data-lit="w" />
            <b>quiet-otter</b>
            <span>Done</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Signal: the shape alphabet as a poster. A circle is a run, a square an ask. */
function Signal(): React.JSX.Element {
  return (
    <div className="hero-art for-theme for-signal" role="img" aria-label={SAID}>
      <div className="sg-poster">
        <div className="sg-cell sg-big">
          <svg viewBox="0 0 30 30" aria-hidden="true">
            <circle className="run" cx="15" cy="15" r="15" />
          </svg>
          <span className="sg-label">On it</span>
          <span className="sg-name">amber-heron</span>
        </div>
        <div className="sg-cell">
          <svg viewBox="0 0 30 30" aria-hidden="true">
            <rect className="ask" width="30" height="30" />
            <rect className="ask-ink" x="5" y="5" width="20" height="20" />
          </svg>
          <span className="sg-label">Needs you</span>
        </div>
        <div className="sg-cell">
          <svg viewBox="0 0 30 30" aria-hidden="true">
            <circle className="ink" cx="15" cy="15" r="9" />
          </svg>
          <span className="sg-label">Done</span>
        </div>
      </div>
    </div>
  );
}

export function HeroArt(): React.JSX.Element {
  return (
    <>
      <Burrow />
      <Annunciator />
      <Signal />
    </>
  );
}
