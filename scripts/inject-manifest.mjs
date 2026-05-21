#!/usr/bin/env node

/**
 * Writes a manifest.json file into the freshly-built static bundle so
 * downstream consumers (wolt-cli's stats updater, GH Pages cache busters)
 * can read {version, commit, built_at} without reaching back to the API.
 *
 * Usage:
 *   node scripts/inject-manifest.mjs [--dir <buildDir>] [--version <vX.Y.Z>] [--commit <sha>]
 *
 * Defaults:
 *   --dir       build
 *   --version   $GITHUB_REF_NAME or "dev"
 *   --commit    $GITHUB_SHA or short HEAD via `git rev-parse --short HEAD`
 */

import { parseArgs } from 'node:util';
import { writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = parseArgs({
	options: {
		dir: { type: 'string', default: 'build' },
		version: { type: 'string' },
		commit: { type: 'string' },
	},
	allowPositionals: false,
});

const buildDir = resolve(process.cwd(), args.values.dir);
if (!existsSync(buildDir)) {
	throw new Error(`build directory not found: ${buildDir}`);
}

const version = args.values.version ?? process.env.GITHUB_REF_NAME ?? 'dev';
let commit = args.values.commit ?? process.env.GITHUB_SHA;
if (!commit) {
	try {
		commit = execSync('git rev-parse --short HEAD', {
			encoding: 'utf8',
		}).trim();
	} catch {
		commit = 'unknown';
	}
}

const manifest = {
	name: 'wolt-stats',
	version,
	commit,
	built_at: new Date().toISOString(),
};

const target = resolve(buildDir, 'manifest.json');
writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${target}: ${JSON.stringify(manifest)}`);
