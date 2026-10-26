// The landing hero's art in Annunciator and Signal: Wake at work, drawn as
// each theme draws it (the apps' brief, "The look"), and shown only while
// its theme is on: one run on it, an ask that needs you, one done. Burrow's
// hero is Wake for Mac's window itself (live-run.tsx). Rendered to HTML at
// build; hero.css draws and moves it.
const SAID = "Wake at work: amber-heron is on it, an ask needs you, and quiet-otter is done.";

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
      <Annunciator />
      <Signal />
    </>
  );
}
