import { expect, test } from "bun:test";
import { folderOf, nextRoots, rootsLines } from "./commands/roots";

process.env.NO_COLOR = "1";

test("a folder is kept whole, with ~ expanded and no trailing slash", () => {
  expect(folderOf("~/code/", "/Users/ada")).toBe("/Users/ada/code");
  expect(folderOf("~", "/Users/ada")).toBe("/Users/ada");
  expect(folderOf("/Users/ada/./work//", "/Users/ada")).toBe("/Users/ada/work");
  expect(() => folderOf("code", "/Users/ada")).toThrow("isn't a whole path");
});

test("adding keeps the order and never doubles; removing drops it", () => {
  expect(nextRoots(["/a", "/b"], "add", "/c")).toEqual(["/a", "/b", "/c"]);
  expect(nextRoots(["/a", "/b"], "add", "/a")).toEqual(["/a", "/b"]);
  expect(nextRoots(["/a", "/b"], "remove", "/a")).toEqual(["/b"]);
});

test("with no folders, it says how to add one", () => {
  expect(rootsLines({ roots: [] }).join("\n")).toContain("wakectl roots add ~/Projects");
  expect(rootsLines({ roots: ["/somewhere/code"] }).join("\n")).toContain("/somewhere/code");
});
