/**
 * format.ts — unit tests.
 *
 * Tests the `formatResultForLLM` function across all output formats,
 * cross-host redirect banners, and the truncation guard.
 */

import { describe, it, expect } from "vitest";
import { formatResultForLLM } from "../extensions/web-fetch/format.ts";
import type { FetchResult } from "../extensions/web-fetch/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkResult(overrides: Partial<FetchResult> = {}): FetchResult {
	return {
		url: "https://example.com/page",
		originalUrl: "https://example.com/page",
		contentType: "text/html",
		crossHost: false,
		content: "<h1>Hello</h1><p>World</p>",
		status: 200,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Format: markdown
// ---------------------------------------------------------------------------

describe("formatResultForLLM — markdown", () => {
	it("converts HTML to Markdown", () => {
		const result = formatResultForLLM(mkResult(), "markdown");
		expect(result).toContain("# Hello");
		expect(result).toContain("World");
		expect(result).not.toContain("<h1>");
	});

	it("passes through non-HTML content unchanged", () => {
		const result = formatResultForLLM(
			mkResult({ contentType: "text/plain", content: "Plain text content" }),
			"markdown",
		);
		expect(result).toBe("Plain text content");
	});

	it("passes through content already labelled as text/markdown", () => {
		const md = "## Already Markdown";
		const result = formatResultForLLM(mkResult({ contentType: "text/markdown", content: md }), "markdown");
		expect(result).toBe(md);
	});
});

// ---------------------------------------------------------------------------
// Format: text
// ---------------------------------------------------------------------------

describe("formatResultForLLM — text", () => {
	it("strips HTML tags to produce plain text", () => {
		const result = formatResultForLLM(mkResult(), "text");
		expect(result).not.toContain("<h1>");
		expect(result).not.toContain("</");
		expect(result).toContain("Hello");
		expect(result).toContain("World");
	});

	it("strips script and style blocks entirely", () => {
		const result = formatResultForLLM(
			mkResult({
				content: "<p>Keep</p><script>alert('x')</script><style>.x{}</style><p>Also keep</p>",
			}),
			"text",
		);
		expect(result).toContain("Keep");
		expect(result).toContain("Also keep");
		expect(result).not.toContain("alert");
		expect(result).not.toContain(".x{}");
	});

	it("passes through non-HTML content unchanged", () => {
		const result = formatResultForLLM(mkResult({ contentType: "text/plain", content: "Plain text" }), "text");
		expect(result).toBe("Plain text");
	});
});

// ---------------------------------------------------------------------------
// Format: html
// ---------------------------------------------------------------------------

describe("formatResultForLLM — html", () => {
	it("returns raw HTML unchanged", () => {
		const raw = "<h1>Hello</h1><p>World</p>";
		const result = formatResultForLLM(mkResult({ content: raw }), "html");
		expect(result).toBe(raw);
	});
});

// ---------------------------------------------------------------------------
// Cross-host redirect banner
// ---------------------------------------------------------------------------

describe("formatResultForLLM — cross-host redirect", () => {
	it("prepends a redirect banner when crossHost is true and URLs differ", () => {
		const result = formatResultForLLM(
			mkResult({
				crossHost: true,
				originalUrl: "https://old.example.com/page",
				url: "https://new.example.com/page",
				contentType: "text/plain",
				content: "Body content",
			}),
			"text",
		);
		expect(result).toContain("[Cross-host redirect]");
		expect(result).toContain("old.example.com");
		expect(result).toContain("new.example.com");
		expect(result).toContain("Body content");
	});

	it("does not prepend a banner when crossHost is false", () => {
		const result = formatResultForLLM(
			mkResult({
				crossHost: false,
				originalUrl: "https://example.com/a",
				url: "https://example.com/b",
				contentType: "text/plain",
				content: "Body",
			}),
			"text",
		);
		expect(result).not.toContain("[Cross-host redirect]");
	});

	it("does not prepend a banner when originalUrl equals url even if crossHost is true", () => {
		const result = formatResultForLLM(
			mkResult({
				crossHost: true,
				originalUrl: "https://example.com/same",
				url: "https://example.com/same",
				contentType: "text/plain",
				content: "Body",
			}),
			"text",
		);
		expect(result).not.toContain("[Cross-host redirect]");
	});
});

// ---------------------------------------------------------------------------
// Truncation guard
// ---------------------------------------------------------------------------

describe("formatResultForLLM — truncation", () => {
	it("truncates output larger than 240 000 characters and appends a notice", () => {
		const huge = "A".repeat(300_000);
		const result = formatResultForLLM(mkResult({ contentType: "text/plain", content: huge }), "text");
		expect(result.length).toBeLessThan(300_000);
		expect(result).toContain("[Truncated");
		expect(result).toContain("240,000");
	});

	it("does not truncate output under the limit", () => {
		const content = "Short content.";
		const result = formatResultForLLM(mkResult({ contentType: "text/plain", content }), "text");
		expect(result).toBe(content);
		expect(result).not.toContain("[Truncated");
	});
});
