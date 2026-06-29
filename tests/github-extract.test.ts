/**
 * github-extract.ts — unit tests.
 *
 * Tests URL parsing in `parseGitHubUrl` — the pure, network-free function
 * that determines whether a URL is a GitHub code URL and extracts its
 * structured metadata.
 */

import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../extensions/web-fetch/github-extract.ts";

describe("parseGitHubUrl", () => {
	// ---------------------------------------------------------------------------
	// Valid GitHub URLs
	// ---------------------------------------------------------------------------

	it("parses a repo root URL", () => {
		const info = parseGitHubUrl("https://github.com/owner/repo");
		expect(info).toEqual({
			owner: "owner",
			repo: "repo",
			refIsFullSha: false,
			type: "root",
		});
	});

	it("parses a repo URL with trailing slash", () => {
		const info = parseGitHubUrl("https://github.com/owner/repo/");
		expect(info?.type).toBe("root");
		expect(info?.owner).toBe("owner");
		expect(info?.repo).toBe("repo");
	});

	it("strips .git suffix from repo name", () => {
		const info = parseGitHubUrl("https://github.com/owner/repo.git");
		expect(info?.repo).toBe("repo");
	});

	it("parses a blob URL with ref and path", () => {
		const info = parseGitHubUrl("https://github.com/owner/repo/blob/main/src/index.ts");
		expect(info).toEqual({
			owner: "owner",
			repo: "repo",
			ref: "main",
			refIsFullSha: false,
			path: "src/index.ts",
			type: "blob",
		});
	});

	it("parses a tree URL with ref and path", () => {
		const info = parseGitHubUrl("https://github.com/owner/repo/tree/develop/lib");
		expect(info).toEqual({
			owner: "owner",
			repo: "repo",
			ref: "develop",
			refIsFullSha: false,
			path: "lib",
			type: "tree",
		});
	});

	it("detects a full 40-char commit SHA as ref", () => {
		const sha = "a".repeat(40);
		const info = parseGitHubUrl(`https://github.com/owner/repo/blob/${sha}/file.ts`);
		expect(info?.refIsFullSha).toBe(true);
		expect(info?.ref).toBe(sha);
	});

	it("parses www.github.com URLs", () => {
		const info = parseGitHubUrl("https://www.github.com/owner/repo");
		expect(info?.owner).toBe("owner");
	});

	it("handles encoded path segments", () => {
		const info = parseGitHubUrl("https://github.com/owner/repo/blob/main/path%20with%20spaces/file.ts");
		expect(info?.path).toBe("path with spaces/file.ts");
	});

	// ---------------------------------------------------------------------------
	// Non-GitHub or non-code URLs → null
	// ---------------------------------------------------------------------------

	it("returns null for non-GitHub hosts", () => {
		expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
		expect(parseGitHubUrl("https://bitbucket.org/owner/repo")).toBeNull();
	});

	it("returns null for GitHub issue URLs", () => {
		expect(parseGitHubUrl("https://github.com/owner/repo/issues/42")).toBeNull();
	});

	it("returns null for GitHub pull request URLs", () => {
		expect(parseGitHubUrl("https://github.com/owner/repo/pull/123")).toBeNull();
	});

	it("returns null for GitHub Discussions", () => {
		expect(parseGitHubUrl("https://github.com/owner/repo/discussions/1")).toBeNull();
	});

	it("returns null for GitHub Actions URLs", () => {
		expect(parseGitHubUrl("https://github.com/owner/repo/actions/runs/123")).toBeNull();
	});

	it("returns null for bare /owner (no repo)", () => {
		expect(parseGitHubUrl("https://github.com/owner")).toBeNull();
	});

	it("returns null for invalid URLs", () => {
		expect(parseGitHubUrl("not-a-url")).toBeNull();
		expect(parseGitHubUrl("")).toBeNull();
	});

	it("returns null for blob/tree URLs missing a ref", () => {
		// blob/ with no ref — not a valid code URL
		expect(parseGitHubUrl("https://github.com/owner/repo/blob")).toBeNull();
	});
});
