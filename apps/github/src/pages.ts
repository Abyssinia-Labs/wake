// The bridge's few pages, as plain HTML in wakectl.dev's inks: what it is,
// installing the GitHub App, and pairing Wake once signed in with GitHub.
import type { PlaceView, Tool } from "@abyssinia-labs/wake-server";
import { TOOL_NAMES, TOOLS } from "./commands";

const esc = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

function page(title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--paper:#f4efe4;--card:#fffcf5;--ink:#14213d;--a:#0078bf;--b:#ff7477}
@media (prefers-color-scheme:dark){:root{--paper:#1c1a22;--card:#26232e;--ink:#f2eee3;--a:#ffe800;--b:#ff48b0}}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 system-ui,sans-serif}
main{max-width:680px;margin:0 auto;padding:40px 16px}
h1{font-size:44px;line-height:1;margin:0 0 16px;color:var(--a);text-shadow:3px 2px 0 var(--b);letter-spacing:-.03em}
h2{margin:32px 0 8px}
.card{background:var(--card);border:2px solid var(--ink);border-radius:6px;padding:16px 18px;margin:12px 0}
code,pre{font-family:ui-monospace,monospace;font-size:15px}
pre{background:var(--ink);color:var(--paper);padding:12px 14px;border-radius:4px;overflow-x:auto;user-select:all}
a{color:var(--a)}button,.button{font:inherit;font-weight:600;background:var(--ink);color:var(--paper);border:0;border-radius:999px;padding:9px 18px;cursor:pointer;text-decoration:none;display:inline-block}
form{display:inline}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}small{opacity:.75}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export function home(o: { installUrl: string; signedIn: boolean }): Response {
  return page(
    "Wake for GitHub",
    `<h1>Wake for GitHub</h1>
<p>Label an issue <code>wake</code>, or write <code>/wake</code> in a comment or a pull request review, and your coding agent (Claude Code, Codex or Cursor) starts on <em>your</em> machine: in your clone, on the issue's own branch, inside Wake's sandbox. It reads the issue with <code>gh</code>, opens a pull request that closes it, and the issue shows how it's going.</p>
<div class="row"><a class="button" href="${esc(o.installUrl)}">Install on your repositories</a>
<a href="${o.signedIn ? "/pair" : "/auth/login"}">${o.signedIn ? "Pair Wake" : "Sign in with GitHub to pair Wake"}</a></div>
<h2>How to ask</h2>
<div class="card"><p><code>wake</code> on an issue, or <code>/wake</code> on its own line in a comment: your first paired agent works on it.<br><code>wake:codex</code> or <code>/wake cursor</code> picks the tool. On a pull request, <code>/wake</code> in a review addresses the feedback on its branch.</p>
<small>Only you can wake your agent, and only on a repository you can push to. Taking the label off or closing the issue lets it go.</small></div>
<p><small>Wake is open source: <a href="https://wakectl.dev">wakectl.dev</a>.</small></p>`,
  );
}

export function pairPage(o: {
  login: string;
  places: Record<Tool, PlaceView[]>;
  code?: { tool: Tool; command: string };
}): Response {
  const tools = TOOLS.map((tool) => {
    const machines = o.places[tool].map((p) => esc(p.machine)).join(", ");
    const shown =
      o.code?.tool === tool
        ? `<p>Run this on your machine within ten minutes:</p><pre>${esc(o.code.command)}</pre>`
        : "";
    return `<div class="card"><div class="row"><strong>${TOOL_NAMES[tool]}</strong>
<form method="post" action="/pair"><input type="hidden" name="tool" value="${tool}"><button>Get a code</button></form></div>
${machines ? `<small>Paired on ${machines}</small>` : "<small>Not paired yet</small>"}${shown}</div>`;
  }).join("");
  return page(
    "Pair Wake",
    `<h1>Pair Wake</h1><p>Signed in as <strong>@${esc(o.login)}</strong>. Get a code for the tool that should run, and run the command it gives in a terminal on the machine your clones are on. You need <a href="https://wakectl.dev/start/getting-started/">Wake</a> installed there.</p>
${tools}<form method="post" action="/auth/logout"><button>Sign out</button></form>`,
  );
}

export const notFound = (): Response =>
  page("Not found", '<h1>Not here</h1><p><a href="/">Wake for GitHub</a></p>');
