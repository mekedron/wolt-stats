import type SqlJs from 'sql.js';

export type SqlDatabase = SqlJs.Database;
export type SqlBindParams = SqlJs.BindParams;

export function queryAll<T extends Record<string, unknown>>(
	db: SqlDatabase,
	sql: string,
	params: SqlBindParams = [],
): T[] {
	const statement = db.prepare(sql, params);
	const rows: T[] = [];

	while (statement.step()) {
		rows.push(statement.getAsObject() as T);
	}

	statement.free();
	return rows;
}

export function queryFirst<T extends Record<string, unknown>>(
	db: SqlDatabase,
	sql: string,
	params: SqlBindParams = [],
): T | null {
	return queryAll<T>(db, sql, params)[0] ?? null;
}
