import { base } from '$app/paths';
import { env } from '$env/dynamic/public';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import type { SqlDatabase } from '$lib/data/sql';

const DEFAULT_DATABASE_PATH = resolveDatabasePath(
	env.PUBLIC_WOLT_STATS_DATABASE_PATH || 'data/wolt-history.sqlite',
);
const databasePromises = new Map<string, Promise<SqlDatabase>>();

export async function loadDatabase(
	databasePath = DEFAULT_DATABASE_PATH,
): Promise<SqlDatabase> {
	const resolvedPath = resolveDatabasePath(databasePath);

	if (!databasePromises.has(resolvedPath)) {
		databasePromises.set(
			resolvedPath,
			(async () => {
				const [SQL, response] = await Promise.all([
					initSqlJs({
						locateFile: () => wasmUrl,
					}),
					fetch(resolvedPath),
				]);

				if (!response.ok) {
					throw new Error(
						`Dashboard database not found at ${resolvedPath}. Run ./scripts/sync-wolt-history.sh or npm run db:demo first.`,
					);
				}

				const buffer = await response.arrayBuffer();
				return new SQL.Database(new Uint8Array(buffer));
			})(),
		);
	}

	return databasePromises.get(resolvedPath) as Promise<SqlDatabase>;
}

function resolveDatabasePath(path: string) {
	const trimmed = path.trim();
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		return trimmed;
	}
	if (trimmed.startsWith('/')) {
		return trimmed;
	}
	return `${base}/${trimmed}`.replace(/\/{2,}/g, '/');
}
