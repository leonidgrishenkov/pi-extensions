#!/usr/bin/env node

/**
 * Validates theme JSON files against their declared JSON Schema.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = join(__dirname, "..", "themes");

async function main(): Promise<void> {
	const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"));
	if (files.length === 0) {
		console.error("No .json theme files found in", THEMES_DIR);
		process.exit(1);
	}

	let failures = 0;
	const globalAjv = new Ajv({ allErrors: true, strict: false });
	const compiledSchemas = new Map<string, any>();

	for (const file of files) {
		const filePath = join(THEMES_DIR, file);
		let theme: Record<string, unknown>;

		try {
			theme = JSON.parse(readFileSync(filePath, "utf-8"));
		} catch (err) {
			console.error(`✗ ${file}: invalid JSON — ${(err as Error).message}`);
			failures++;
			continue;
		}

		const schemaUrl = theme.$schema as string | undefined;
		if (!schemaUrl) {
			console.error(`✗ ${file}: missing "$schema" property, cannot validate.`);
			failures++;
			continue;
		}

		if (!compiledSchemas.has(schemaUrl)) {
			console.log(`Fetching JSON Schema: ${schemaUrl}`);
			try {
				const res = await fetch(schemaUrl);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const schemaData = await res.json();
				compiledSchemas.set(schemaUrl, globalAjv.compile(schemaData));
			} catch (err) {
				console.error(
					`✗ Could not fetch schema (${(err as Error).message}), skipping validation.`,
				);
				compiledSchemas.set(schemaUrl, null);
			}
		}

		const validate = compiledSchemas.get(schemaUrl);
		if (!validate) {
			failures++;
			continue;
		}

		const valid = validate(theme);
		if (!valid) {
			console.error(`✗ ${file}: schema validation failed`);
			for (const err of validate.errors ?? []) {
				console.error(`    ${err.instancePath || "/"} ${err.message}`);
			}
			failures++;
		} else {
			console.log(`✓ ${file}: valid`);
		}
	}

	if (failures > 0) {
		console.error(`\n${failures} validation error(s)`);
		process.exit(1);
	}
	
	console.log(`\nAll ${files.length} theme(s) passed schema validation.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
