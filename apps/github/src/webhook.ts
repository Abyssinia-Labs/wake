// GitHub's events, turned into wake/v1 (WAK-4). A `wake` label on an issue
// or a `/wake` line in a comment or a review summons the sender's own agent,
// if they can push to the repository and have paired; closing the issue or
// the pull request, or taking the label off, lets a waiting summons go.
import type { Tool, Wake } from "@abyssinia-labs/wake-server";
import { askFor, subjectOf, type Work } from "./asks";
import { type Asked, agentId, askedByLabel, askedInText, ownerId, TOOLS } from "./commands";
import type { Asks } from "./db";
import { canPush, type GitHub } from "./github";
import { installationOf, issueOf, num, type Obj, obj, personOf, repoOf, str } from "./payload";

export type Bridge = { wake: Wake; asks: Asks; github: GitHub; origin: string };

/** What the bridge did with an event, for its log and its tests. */
export type Handled = { did: string; summons?: string };

export async function handleEvent(b: Bridge, event: string, payload: Obj): Promise<Handled> {
  const installation = installationOf(payload);
  const action = str(payload.action);
  if (event === "installation" && action === "deleted" && installation !== null) {
    let done = false;
    while (!done) ({ done } = await b.wake.deleteScope(String(installation)));
    return { did: "forgot the installation" };
  }
  const repo = repoOf(payload.repository);
  const sender = personOf(payload.sender);
  if (installation === null || !repo) return { did: "ignored" };

  if ((event === "issues" || event === "pull_request") && action === "closed") {
    const number = num(obj(payload.issue ?? payload.pull_request)?.number);
    if (number === null) return { did: "ignored" };
    await b.wake.settle({
      subject: subjectOf(repo.id, number),
      state: "dropped",
      reason: "Closed.",
    });
    return { did: "settled: closed" };
  }
  if (event === "issues" && (action === "labeled" || action === "unlabeled")) {
    const asked = askedByLabel(str(obj(payload.label)?.name) ?? "");
    const issue = issueOf(payload.issue);
    if (!asked || !issue || !sender) return { did: "ignored" };
    if (action === "unlabeled") {
      await b.wake.settle({
        subject: subjectOf(repo.id, issue.number),
        kind: "labeled",
        state: "dropped",
        reason: "The wake label was taken off.",
      });
      return { did: "settled: unlabeled" };
    }
    const work: Work = {
      kind: "issue",
      repo: repo.fullName,
      repoId: repo.id,
      ...pick(issue),
      asker: sender.login,
      via: "labeled",
    };
    return await summon(
      b,
      installation,
      work,
      sender,
      asked,
      `/repos/${repo.fullName}/issues/${issue.number}`,
    );
  }

  const comment = commentOf(event, action, payload, repo.fullName);
  if (!comment || !sender) return { did: "ignored" };
  const asked = askedInText(comment.body);
  if (!asked) return { did: "ignored" };
  const issue = issueOf(payload.issue ?? payload.pull_request);
  if (!issue) return { did: "ignored" };
  const base = {
    repo: repo.fullName,
    repoId: repo.id,
    ...pick(issue),
    asker: sender.login,
    via: "mentioned" as const,
    comment,
  };
  if (!issue.isPull) {
    return await summon(b, installation, { kind: "issue", ...base }, sender, asked, comment.react);
  }
  // Review feedback is worked on the pull request's own branch, which must be in this repository.
  const pr = obj(payload.pull_request)
    ? {
        head: str(obj(obj(payload.pull_request)?.head)?.ref) ?? "",
        headRepo: str(obj(obj(obj(payload.pull_request)?.head)?.repo)?.full_name),
      }
    : await b.github.pull(installation, repo.fullName, issue.number);
  if (pr.headRepo !== repo.fullName || !pr.head) {
    await b.github.comment(
      installation,
      repo.fullName,
      issue.number,
      `@${sender.login}: Wake can only work on a pull request whose branch is in ${repo.fullName}, not a fork's.`,
    );
    return { did: "refused: fork" };
  }
  return await summon(
    b,
    installation,
    { kind: "review", ...base, head: pr.head },
    sender,
    asked,
    comment.react,
  );
}

function pick(issue: { number: number; title: string; url: string }) {
  return { number: issue.number, title: issue.title, url: issue.url };
}

type Comment = { id: number; url: string; api: string; body: string; react: string };

/** A new comment, review or review comment with its body, and the paths to read and react to it. */
function commentOf(
  event: string,
  action: string | null,
  payload: Obj,
  repo: string,
): Comment | null {
  const made =
    (event === "issue_comment" && action === "created") ||
    (event === "pull_request_review_comment" && action === "created") ||
    (event === "pull_request_review" && action === "submitted");
  if (!made) return null;
  const o = obj(event === "pull_request_review" ? payload.review : payload.comment);
  const id = num(o?.id);
  const url = str(o?.html_url);
  const body = str(o?.body);
  if (id === null || !url || body === null) return null;
  if (event === "issue_comment") {
    const path = `/repos/${repo}/issues/comments/${id}`;
    return { id, url, body, api: path.slice(1), react: path };
  }
  if (event === "pull_request_review_comment") {
    const path = `/repos/${repo}/pulls/comments/${id}`;
    return { id, url, body, api: path.slice(1), react: path };
  }
  const number = num(obj(payload.pull_request)?.number);
  // A review takes no reaction; its pull request does.
  return {
    id,
    url,
    body,
    api: `repos/${repo}/pulls/${number}/reviews/${id}`,
    react: `/repos/${repo}/issues/${number}`,
  };
}

/** The tool asked for, or the first the person has paired. */
async function agentFor(wake: Wake, userId: number, asked: Asked): Promise<Tool | null> {
  for (const tool of asked.tool ? [asked.tool] : TOOLS) {
    if ((await wake.places(agentId(userId, tool))).length > 0) return tool;
  }
  return null;
}

async function summon(
  b: Bridge,
  installation: number,
  work: Work,
  sender: { id: number; login: string },
  asked: Asked,
  react: string,
): Promise<Handled> {
  if (!canPush(await b.github.permission(installation, work.repo, sender.login))) {
    await b.github.react(installation, react, "confused");
    return { did: "refused: can't push" };
  }
  const tool = await agentFor(b.wake, sender.id, asked);
  if (!tool) {
    const which = asked.tool ? ` for ${asked.tool}` : "";
    await b.github.comment(
      installation,
      work.repo,
      work.number,
      `@${sender.login}: pair Wake${which} first, at ${b.origin}/pair, and then ask again.`,
    );
    return { did: "refused: not paired" };
  }
  const ask = askFor(work);
  const summons = await b.wake.summon({
    agent: agentId(sender.id, tool),
    owner: ownerId(sender.id),
    askedBy: ownerId(sender.id),
    scope: String(installation),
    ...ask,
  });
  await b.asks.keep({
    summons,
    installation,
    repo: work.repo,
    number: work.number,
    asker: sender.login,
  });
  await b.github.react(installation, react, "eyes");
  return { did: "summoned", summons };
}
