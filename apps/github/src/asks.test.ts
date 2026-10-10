import { expect, test } from "bun:test";
import { askFor, issueBranch, refOf, type Work } from "./asks";

const issue: Work = {
  kind: "issue",
  repo: "acme/widgets",
  repoId: 42,
  number: 12,
  title: "Login redirects to /undefined after OAuth!",
  url: "https://github.com/acme/widgets/issues/12",
  asker: "ada",
  via: "labeled",
};

test("an issue: its own branch, the gh commands to read it, and Closes on the PR", () => {
  const ask = askFor(issue);
  expect(ask).toMatchObject({
    subject: "42#12",
    kind: "labeled",
    target: { kind: "issue", ref: "acme/widgets#12", url: issue.url },
    repo: "acme/widgets",
    branch: "issue-12-login-redirects-to-undefined-after",
  });
  expect(ask.prompt).toContain("gh issue view 12 --repo acme/widgets --comments");
  expect(ask.prompt).toContain("`Closes #12`");
  expect(ask.prompt).not.toContain("Login redirects");
});

test("review feedback works on the pull request's own branch", () => {
  const ask = askFor({
    ...issue,
    kind: "review",
    via: "mentioned",
    head: "fix-login",
    url: "https://github.com/acme/widgets/pull/13",
    number: 13,
    comment: {
      id: 7,
      url: "https://github.com/acme/widgets/pull/13#discussion_r7",
      api: "repos/acme/widgets/pulls/comments/7",
    },
  });
  expect(ask).toMatchObject({
    kind: "review",
    branch: "fix-login",
    target: { kind: "pull_request" },
  });
  expect(ask.prompt).toContain("gh api repos/acme/widgets/pulls/comments/7");
  expect(ask.prompt).toContain("Never merge, never force-push");
});

test("names stay inside wake/v1's limits", () => {
  expect(refOf(`acme/${"w".repeat(80)}`, 12).length).toBeLessThanOrEqual(64);
  expect(issueBranch(7, "!!!")).toBe("issue-7");
});
