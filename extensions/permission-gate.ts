/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash commands.
 * Sends cross-platform notifications so you never miss a gate.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { notify } from "./notify";

const DANGEROUS_PATTERNS = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;
		const isDangerous = DANGEROUS_PATTERNS.some((p) => p.test(command));

		if (isDangerous) {
			// Notify user immediately so they don't miss it
			const title = "⚠️ Pi Permission Gate";
			notify(title, `Dangerous command detected: ${command}`);

			if (!ctx.hasUI) {
				// In non-interactive mode, block by default
				return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
			}

			const choice = await ctx.ui.select(`  Dangerous command:\n\n  ${command}\n\nAllow?`, ["Yes", "No"]);

			if (choice !== "Yes") {
				return { block: true, reason: "Blocked by user" };
			}
		}

		return undefined;
	});
}
