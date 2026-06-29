import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
	{
		ignores: ["node_modules/**", "dist/**", "*.js", "*.cjs", "*.mjs"],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.es2022,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			// Error detection
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "warn",
			"no-console": "off",
			"no-debugger": "error",

			// Code quality
			"no-var": "error",
			"prefer-const": "warn",
			eqeqeq: ["error", "always"],

			// TypeScript-specific
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-unsafe-function-type": "warn",
		},
	},
];
