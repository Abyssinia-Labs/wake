// An organisation's page, github.wakectl.dev/org/<login> (WAK-23): its
// plan, and on Team its policy and its audit. Its admins only: an org's
// members with the admin role, or a user account's own person.
import type { Wake } from "@abyssinia-labs/wake-server";
import type { Asks } from "./db";
import type { GitHub } from "./github";
import type { Kv } from "./kv";
import { esc, page } from "./pages";
import { type Account, accountOf, type Plan, planOf } from "./plans";
import { type Policy, policyOf, reposFrom, setPolicy } from "./policy";
import type { Session } from "./session";

export type OrgContext = { wake: Wake; asks: Asks; github: GitHub; kv: Kv; origin: string };

async function isAdmin(c: OrgContext, account: Account, who: Session): Promise<boolean> {
  if (account.type === "User") return account.id === who.id;
  if (account.installation === undefined) return false;
  return (await c.github.orgRole(account.installation, account.login, who.login)) === "admin";
}

export async function orgPage(
  c: OrgContext,
  req: Request,
  who: Session,
  login: string,
): Promise<Response> {
  const account = await accountOf(c.kv, login);
  if (!account) {
    return page(
      "Not installed",
      `<h1>Not installed</h1><p>Wake for GitHub isn't installed on <strong>${esc(login)}</strong>.</p>`,
    );
  }
  if (!(await isAdmin(c, account, who))) {
    return new Response(
      await page(
        "Admins only",
        `<h1>Admins only</h1><p>Only ${esc(account.login)}'s admins see its Wake settings.</p>`,
      ).text(),
      { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const plan = await planOf(c.kv, account.id);
  if (req.method === "POST") {
    if (req.headers.get("origin") !== c.origin) return new Response("Forbidden", { status: 403 });
    if (plan.name !== "team") return new Response("Policy comes with Team.", { status: 402 });
    const form = await req.formData();
    const repos = reposFrom(String(form.get("repos") ?? ""));
    await setPolicy(c.kv, account.id, {
      repos,
      who: form.get("who") === "admins" ? "admins" : "push",
      updatedBy: who.login,
    });
    return Response.redirect(`${c.origin}/org/${encodeURIComponent(account.login)}`, 303);
  }
  if (plan.name !== "team") return page(`${account.login} · Wake`, freeBody(account, plan));
  const policy = await policyOf(c.kv, account.id);
  const runs =
    account.installation === undefined
      ? []
      : await c.wake.forScope({ scope: String(account.installation) });
  const rows = await Promise.all(
    runs.map(async (run) => {
      const ask = await c.asks.get(run.id);
      return { run, asker: ask?.asker ?? "?" };
    }),
  );
  return page(`${account.login} · Wake`, teamBody(account, plan, policy, rows));
}

function freeBody(account: Account, plan: Plan): string {
  return `<h1>${esc(account.login)}</h1><p>On <strong>Free</strong>${plan.source === "none" ? "" : ` (${plan.source})`}: anyone who can push to a repository wakes their own agent from it.</p>
<div class="card"><p><strong>Team</strong> adds, for the whole organisation:</p><ul>
<li>a policy: which repositories may summon, and who;</li>
<li>an audit of every run: who asked, where, its name, how it ended;</li>
<li>cloud fallback, later: when no machine is awake, the person's own cloud agent.</li></ul>
<p>Team isn't on sale yet. To try it, <a href="https://github.com/Abyssinia-Labs/wake/issues/new?title=Team%20plan%20for%20${encodeURIComponent(account.login)}">ask us</a>.</p></div>`;
}

const STATE: Record<string, string> = {
  asking: "waiting for its person",
  open: "waiting for a machine",
  claimed: "on it",
  done: "done",
  failed: "couldn't finish",
  dropped: "let go",
};

function teamBody(
  account: Account,
  plan: Plan,
  policy: Policy,
  rows: { run: Awaited<ReturnType<Wake["forScope"]>>[number]; asker: string }[],
): string {
  const trial = plan.trialEnds ? `, trial until ${esc(plan.trialEnds)}` : "";
  const audit = rows.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:15px">${rows
        .map(({ run, asker }) => {
          const when = new Date(run.updatedAt).toISOString().slice(0, 16).replace("T", " ");
          const name = run.run ? `<code>${esc(run.run.name)}</code>` : "";
          const why = run.state === "failed" && run.reason ? `: ${esc(run.reason)}` : "";
          return `<tr><td>${when}</td><td><a href="${esc(run.target.url)}">${esc(run.target.ref)}</a></td><td>@${esc(asker)}</td><td>${name}</td><td>${STATE[run.state] ?? run.state}${why}</td></tr>`;
        })
        .join("")}</table>`
    : "<p><small>No runs yet.</small></p>";
  return `<h1>${esc(account.login)}</h1><p>On <strong>Team</strong> (${plan.source}${trial}).</p>
<h2>Policy</h2><form method="post" action="/org/${encodeURIComponent(account.login)}" class="card">
<p><label>Repositories that may summon, one per line as <code>owner/name</code> (blank: all)<br>
<textarea name="repos" rows="4" style="width:100%;font:inherit">${esc((policy.repos ?? []).join("\n"))}</textarea></label></p>
<p><label>Who may summon <select name="who" style="font:inherit">
<option value="push"${policy.who === "push" ? " selected" : ""}>anyone who can push</option>
<option value="admins"${policy.who === "admins" ? " selected" : ""}>admins and maintainers only</option></select></label></p>
<button>Save</button>${policy.updatedBy ? ` <small>Last set by @${esc(policy.updatedBy)}</small>` : ""}</form>
<h2>Audit</h2>${audit}`;
}
