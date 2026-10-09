---
title: Examples
description: How a tracker and a doc editor wire Wake in, with the prompt each writes.
---

## A pair tool

Give agents a tool that answers "pair Wake". It runs in an action (an HTTP
action behind your API, here), knows the calling agent, and says which
program asked when it can tell:

```ts
export const pairWake = httpAction(async (ctx, req) => {
  const agent = await agentOf(ctx, req); // your token check
  const { code } = await wake.issueCode(ctx, {
    agent: agent.id,
    agentName: agent.name,
    owner: agent.ownerId,
    scope: agent.workspaceId,
    tool: toolOf(req.headers), // "claude" | "codex" | "cursor" | undefined
  });
  return Response.json({ command: pairCommand("acme.dev", code) }, { status: 201 });
});
```

## A tracker: assigning a ticket

When a person assigns a ticket to an agent, in the same mutation:

```ts
if (assignee.kind === "agent" && by.kind === "person") {
  await wake.summon(ctx, {
    agent: assignee.id,
    owner: agentRow.ownerId,
    askedBy: by.id,
    scope: ticket.workspaceId,
    subject: ticket._id,
    kind: "assigned",
    target: { kind: "ticket", ref: ticket.key, url: ticketUrl(ticket) },
    repo: project.repo,                       // "acme/widgets", or leave both out
    branch: branchFor(ticket),                // never the default branch
    prompt: [
      `${by.name} assigned ${ticket.key} to you.`,
      `1. Read it with getticket ${ticket.key}.`,
      `2. Claim it with claimticket ${ticket.key} before you change anything.`,
      `3. Commit on ${branchFor(ticket)}, push it, open a pull request titled "${ticket.key}: …".`,
      `4. Comment on ${ticket.key} with what you did, or what stopped you.`,
    ].join("\n"),
  });
}
```

And when it stops being wanted:

```ts
await wake.settle(ctx, { subject: ticket._id, agent: previous.id, kind: "assigned", state: "dropped", reason: "Unassigned." });
await wake.settle(ctx, { subject: ticket._id, state: "dropped", reason: "Closed." });
```

## A doc editor: a mention in a thread

No repository: Wake starts the agent in an empty folder with your MCP
server as its only tool.

```ts
await wake.summon(ctx, {
  agent: mention.agentId,
  owner: mention.ownerId,
  askedBy: comment.authorId,
  scope: page.workspaceId,
  subject: thread._id,
  kind: "mentioned",
  target: { kind: "thread", ref: page.title.slice(0, 64), url: threadUrl(page, thread) },
  prompt: [
    `${author.name} mentioned you in a comment on "${page.title}".`,
    `1. Read the thread with listThreads and listMentions.`,
    `2. Answer it with replyToThread. If it asks a question, answer; change the page only if it asks you to.`,
  ].join("\n"),
});
```

The agent's reply answers the mention; settle the summons there too:

```ts
await wake.settle(ctx, { subject: thread._id, agent: agentId, state: "done", reason: "Answered." });
```

## Writing the prompt

- Name the target and the tools to read it with. **Never paste the text
  that asked**: a comment is untrusted input, and the agent reads it over
  its own connection, where its access is checked.
- Say how to finish: where to answer, and when to open a pull request.
- Keep it short; it is pasted into the agent's first turn.
