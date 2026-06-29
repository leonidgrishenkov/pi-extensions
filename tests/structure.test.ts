/**
 * Package structure tests.
 *
 * Validates that every theme JSON and prompt Markdown file in the package
 * is well-formed and contains the expected structural fields — so CI catches
 * broken edits before they reach production.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const THEMES_DIR = join(ROOT, "themes");
const PROMPTS_DIR = join(ROOT, "prompts");

// ---------------------------------------------------------------------------
// Theme JSON files
// ---------------------------------------------------------------------------

describe("theme files", () => {
	const themeFiles = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"));

	it("there is at least one theme file", () => {
		expect(themeFiles.length).toBeGreaterThan(0);
	});

	for (const file of themeFiles) {
		describe(file, () => {
			it("is valid JSON", () => {
				const raw = readFileSync(join(THEMES_DIR, file), "utf-8");
				expect(() => JSON.parse(raw)).not.toThrow();
			});

			it("has a non-empty 'name' field", () => {
				const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf-8"));
				expect(typeof theme.name).toBe("string");
				expect(theme.name.length).toBeGreaterThan(0);
			});

			it("has a 'vars' object with at least one entry", () => {
				const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf-8"));
				expect(typeof theme.vars).toBe("object");
				expect(theme.vars).not.toBeNull();
				expect(Object.keys(theme.vars).length).toBeGreaterThan(0);
			});

			it("all colour values are valid #rrggbb hex strings", () => {
				const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf-8"));
				const HEX = /^#[0-9a-f]{6}$/i;
				for (const [, value] of Object.entries(theme.vars)) {
					expect(typeof value).toBe("string");
					expect((value as string).toString()).toMatch(HEX);
				}
			});

			it("filename matches the theme name", () => {
				const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf-8"));
				expect(file.replace(/\.json$/, "")).toBe(theme.name);
			});
		});
	}
});

// ---------------------------------------------------------------------------
// Prompt Markdown files
// ---------------------------------------------------------------------------

describe("prompt files", () => {
	const promptFiles = readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md"));

	it("there is at least one prompt file", () => {
		expect(promptFiles.length).toBeGreaterThan(0);
	});

	for (const file of promptFiles) {
		describe(file, () => {
			it("is non-empty", () => {
				const content = readFileSync(join(PROMPTS_DIR, file), "utf-8");
				expect(content.trim().length).toBeGreaterThan(0);
			});

			it("starts with an H1 heading or front-matter", () => {
				const content = readFileSync(join(PROMPTS_DIR, file), "utf-8").trim();
				const firstLine = content.split("\n")[0];
				const startsWithH1 = firstLine.startsWith("# ");
				const startsWithFrontMatter = firstLine === "---";
				expect(startsWithH1 || startsWithFrontMatter).toBe(true);
			});

			it("contains no Windows-style line endings (CRLF)", () => {
				const content = readFileSync(join(PROMPTS_DIR, file), "utf-8");
				expect(content).not.toContain("\r\n");
			});
		});
	}
});
