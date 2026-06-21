"use strict";

/*
 * Build-time patch applier.
 *
 * Guarantees that vendored CodeMirror dependencies carry our local fixes
 * regardless of which package manager installed node_modules:
 *   - pnpm applies patches at install time via the `patchedDependencies`
 *     entry in pnpm-workspace.yaml (used by the CI plugin build).
 *   - This script makes the *build* self-sufficient for npm (and any other)
 *     installs, so `npm run build:plugins` always produces patched output.
 *
 * It is idempotent: if the target file already contains the patch (e.g. pnpm
 * applied it at install time) the patch is skipped, so it never double-applies.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const patches = [
	{
		name: "@replit/codemirror-minimap",
		// File to patch, relative to node_modules/<name>
		target: "dist/index.js",
		// Patch file (pnpm format: paths relative to the package root)
		patch: "patches/@replit__codemirror-minimap@0.5.2.patch",
		// A token only present once the patch has been applied
		marker: "getMinimapMetrics",
		// Leading path components to strip (a/dist/index.js -> dist/index.js)
		strip: 1
	}
];

for (const p of patches) {
	const pkgDir = path.join(root, "node_modules", p.name);
	const targetFile = path.join(pkgDir, p.target);
	const patchFile = path.join(root, p.patch);

	if (!fs.existsSync(targetFile)) {
		console.warn(`[patch] ${p.name} is not installed; skipping`);
		continue;
	}
	if (!fs.existsSync(patchFile)) {
		console.warn(`[patch] missing patch file ${p.patch}; skipping`);
		continue;
	}
	if (fs.readFileSync(targetFile, "utf8").includes(p.marker)) {
		console.log(`[patch] ${p.name} already patched`);
		continue;
	}

	console.log(`[patch] applying ${p.patch} to ${p.name}`);
	execFileSync("patch", ["-p" + p.strip, "-d", pkgDir], {
		input: fs.readFileSync(patchFile),
		stdio: ["pipe", "inherit", "inherit"]
	});
}
