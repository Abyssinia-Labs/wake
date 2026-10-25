// Adding a device (the spec's "Devices that watch"): the owner, signed in
// with GitHub, gets a watch code for one of their agents, and Wake on a
// phone, in a browser or on a Mac takes it to list that agent's runs. A
// code is made only here, behind sign-in: nothing a run can reach makes one
// (the spec's principle 5). Devices come with Pro (the owner's call,
// 2026-10-23), so the plan hook says so at every watch call.
import {
  type DeviceView,
  type PlanHook,
  type Platform,
  type Tool,
  type Wake,
  WakeError,
  watchLink,
} from "@abyssinia-labs/wake-server";
import { agentId, ownerId, TOOL_NAMES, TOOLS } from "./commands";
import type { Kv } from "./kv";
import { esc, page } from "./pages";
import { planOf } from "./plans";
import type { Session } from "./session";

/** Devices and their alerts come with a paid plan on the owner's own account. */
export function devicePlan(kv: Kv): PlanHook {
  return async ({ owner }) => {
    const id = Number(owner.match(/^gh-(\d+)$/)?.[1]);
    const plan = Number.isSafeInteger(id) ? await planOf(kv, id) : null;
    const on = plan?.name === "pro" || plan?.name === "team" ? "included" : "not-in-plan";
    return { devices: on, alerts: on };
  };
}

export type DevicesContext = { wake: Wake; kv: Kv; origin: string };

type Shown = { tool: Tool; code: string; link: string; minutes: number };

const PLATFORM: Record<Platform, string> = { ios: "iPhone", darwin: "Mac", web: "Browser" };
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `/devices`: each agent's devices, a code to add one, and forgetting one. */
export async function devicesRoute(
  c: DevicesContext,
  req: Request,
  who: Session,
): Promise<Response> {
  const owner = ownerId(who.id);
  let shown: Shown | undefined;
  let status = 200;
  if (req.method === "POST") {
    // A form from this site only: the session cookie is Lax, and this checks the rest.
    if (req.headers.get("origin") !== c.origin) return new Response("Forbidden", { status: 403 });
    const form = await req.formData();
    const tool = TOOLS.find((one) => one === form.get("tool"));
    if (!tool) return new Response("Which agent?", { status: 400 });
    const agent = agentId(who.id, tool);
    if (form.get("action") === "forget") {
      await c.wake.forgetDevice({ agent, device: String(form.get("device") ?? "") });
      return new Response(null, { status: 303, headers: { location: "/devices" } });
    }
    try {
      const issued = await c.wake.issueWatchCode({
        agent,
        agentName: TOOL_NAMES[tool],
        owner,
        tool,
      });
      const domain = new URL(c.origin).host;
      shown = {
        tool,
        code: issued.code,
        link: watchLink(domain, issued.code),
        minutes: Math.max(1, Math.round((issued.expiresAt - Date.now()) / 60_000)),
      };
    } catch (error) {
      if (!(error instanceof WakeError) || error.code !== "NOT_IN_PLAN") throw error;
      status = 402;
    }
  }
  const plan = await planOf(c.kv, who.id);
  const devices = Object.fromEntries(
    await Promise.all(
      TOOLS.map(async (tool) => [tool, await c.wake.devices(agentId(who.id, tool))]),
    ),
  ) as Record<Tool, DeviceView[]>;
  const paid = plan.name === "pro" || plan.name === "team";
  return devicesPage(
    { login: who.login, host: new URL(c.origin).host, paid, devices, shown },
    status,
  );
}

function devicesPage(
  o: {
    login: string;
    host: string;
    paid: boolean;
    devices: Record<Tool, DeviceView[]>;
    shown: Shown | undefined;
  },
  status: number,
): Response {
  const offer = o.paid
    ? ""
    : `<div class="card"><p>Devices come with <strong>Pro</strong>, for your own account: $8 a month or $80 a year. <a href="/org/${esc(o.login)}">Your plan</a></p></div>`;
  const tools = TOOLS.map((tool) => {
    const rows = o.devices[tool]
      .map(
        (
          d,
        ) => `<li class="row">${esc(d.name)} <small>${PLATFORM[d.platform]}, added ${day(d.madeAt)}${
          d.lastSeenAt ? `, last seen ${day(d.lastSeenAt)}` : ""
        }</small>
<form method="post" action="/devices"><input type="hidden" name="action" value="forget"><input type="hidden" name="tool" value="${tool}"><input type="hidden" name="device" value="${esc(d.id)}"><button>Forget</button></form></li>`,
      )
      .join("");
    const add = o.paid
      ? `<form method="post" action="/devices"><input type="hidden" name="action" value="add"><input type="hidden" name="tool" value="${tool}"><button>Get a code</button></form>`
      : "";
    const code =
      o.shown?.tool === tool
        ? `<p>In Wake on the device, add <code>${esc(o.host)}</code> with this code, within ${o.shown.minutes} minutes:</p><pre>${esc(o.shown.code)}</pre>
<small>Or open this link on the device: <a href="${esc(o.shown.link)}">${esc(o.shown.link)}</a></small>`
        : "";
    return `<div class="card"><div class="row"><strong>${TOOL_NAMES[tool]}</strong>${add}</div>
${rows ? `<ul>${rows}</ul>` : "<small>No devices yet</small>"}${code}</div>`;
  }).join("");
  const res = page(
    "Add a device",
    `<h1>Add a device</h1><p>Signed in as <strong>@${esc(o.login)}</strong>. A device (Wake on your phone, in a browser or on your Mac) watches one of your agents: it lists its runs as they go, and how each ended. Get a code for the agent here and type it on the device. A code works once.</p>
${offer}${tools}<p><a href="/pair">Pair Wake</a></p>`,
  );
  return new Response(res.body, { status, headers: res.headers });
}
