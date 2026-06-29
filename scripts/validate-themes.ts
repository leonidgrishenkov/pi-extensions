#!/usr/bin/env node

/**
 * Validates theme JSON files:
 *   1. Each file is valid JSON.
 *   2. Contains required `name` (string) and `vars` (object) fields.
 *   3. All colour values in `vars` are valid hex colour strings (#rrggbb).
 *   4. If `--schema-url` is provided, fetches the JSON Schema and validates
 *      each theme against it (best-effort, skipped when offline).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = join(__dirname, "..", "themes");
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
// Structural validation (always runs)
// ---------------------------------------------------------------------------

function validateStructure(): { failures: number; files: string[] } {
	let failures = 0;
	const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"));

	if (files.length === 0) {
		console.error("No .json theme files found in", THEMES_DIR);
		process.exit(1);
	}

	for (const file of files) {
		const filePath = join(THEMES_DIR, file);
		let theme: Record<string, unknown>;

		try {
			theme = JSON.parse(readFileSync(filePath, "utf-8"));
		} catch (err) {
			console.error(`✗ ${file}: invalid JSON —`, (err as Error).message);
			failures++;
			continue;
		}

		// name
		if (typeof theme.name !== "string" || !theme.name) {
			console.error(`✗ ${file}: missing or invalid "name" field`);
			failures++;
		}

		// vars
		if (typeof theme.vars !== "object" || theme.vars === null || Array.isArray(theme.vars)) {
			console.error(`✗ ${file}: missing or invalid "vars" object`);
			failures++;
			continue;
		}

		const vars = theme.vars as Record<string, unknown>;
		for (const [, value] of Object.entries(vars)) {
			if (typeof value !== "string" || !HEX_COLOR.test(value)) {
				console.error(`✗ ${file}: vars entry is not a valid hex colour (${JSON.stringify(value)})`);
				failures++;
			}
		}

		console.log(`✓ ${file}: ${theme.name} (${Object.keys(vars).length} vars)`);
	}

	return { failures, files };
}

// ---------------------------------------------------------------------------
// Optional JSON Schema validation
// ---------------------------------------------------------------------------

async function validateAgainstSchema(files: string[], schemaUrl: string): Promise<number> {
	let failures = 0;
	console.log(`\nValidating against JSON Schema: ${schemaUrl}`);

	let schema: Record<string, unknown>;
	try {
		const res = await fetch(schemaUrl);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		schema = (await res.json()) as Record<string, unknown>;
	} catch (err) {
		console.warn(`⚠ Could not fetch schema (${(err as Error).message}), skipping schema validation`);
		return 0;
	}

	const ajv = new Ajv({ allErrors: true, strict: false });
	const validate = ajv.compile(schema);

	for (const file of files) {
		const filePath = join(THEMES_DIR, file);
		let theme: unknown;
		try {
			theme = JSON.parse(readFileSync(filePath, "utf-8"));
		} catch {
			continue; // already reported above
		}
		const valid = validate(theme);
		if (!valid) {
			console.error(`✗ ${file}: schema validation failed`);
			for (const err of validate.errors ?? []) {
				console.error(`    ${err.instancePath || "/"}: ${err.message}`);
			}
			failures++;
		} else {
			console.log(`✓ ${file}: schema valid`);
		}
	}

	return failures;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const { failures: structFailures, files } = validateStructure();

	const schemaIdx = process.argv.indexOf("--schema");
	const schemaUrl = schemaIdx !== -1 ? process.argv[schemaIdx + 1] : null;

	let schemaFailures = 0;
	if (schemaUrl) {
		schemaFailures = await validateAgainstSchema(files, schemaUrl);
	}

	const total = structFailures + schemaFailures;
	if (total > 0) {
		console.error(`\n${total} validation error(s)`);
		process.exit(1);
	}
	console.log(`\nAll ${files.length} theme(s) valid.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
