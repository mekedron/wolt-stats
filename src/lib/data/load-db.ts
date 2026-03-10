import { base } from '$app/paths';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import type { SqlDatabase } from '$lib/data/sql';

let databasePromise: Promise<SqlDatabase> | null = null;

export async function loadDatabase(
	databasePath = `${base}/data/wolt-history.sqlite`,
): Promise<SqlDatabase> {
	if (!databasePromise) {
		databasePromise = (async () => {
			const [SQL, response] = await Promise.all([
				initSqlJs({
					locateFile: () => wasmUrl,
				}),
				fetch(databasePath),
			]);

			if (!response.ok) {
				throw new Error(
					`Dashboard database not found at ${databasePath}. Run ./scripts/sync-wolt-history.sh first.`,
				);
			}

			const buffer = await response.arrayBuffer();
			return new SQL.Database(new Uint8Array(buffer));
		})();
	}

	return databasePromise;
}
