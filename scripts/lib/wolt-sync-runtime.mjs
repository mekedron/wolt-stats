import { spawn } from 'node:child_process';

export const RATE_LIMIT_DELAY_MS = 650;

const MAX_RETRIES = 6;

export function parseWoltCli(rawValue) {
	try {
		const parsed = JSON.parse(rawValue ?? '["wolt"]');
		if (
			!Array.isArray(parsed) ||
			parsed.length === 0 ||
			!parsed.every((part) => typeof part === 'string')
		) {
			throw new Error(
				'WOLT_CLI_JSON must be a non-empty JSON array of strings.',
			);
		}
		return parsed;
	} catch (error) {
		throw new Error(
			`Could not parse WOLT_CLI_JSON. Expected JSON like ["wolt"] or ["go","run","/path/to/wolt"]. ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}
}

export async function runWoltJson(
	{ commandArgs, locale, profileName, woltCli },
	attempt = 0,
) {
	const fullArgs = [
		...woltCli.slice(1),
		'--format',
		'json',
		'--profile',
		profileName,
	];
	if (locale) {
		fullArgs.push('--locale', locale);
	}
	fullArgs.push(...commandArgs);

	const result = await new Promise((resolve, reject) => {
		const child = spawn(woltCli[0], fullArgs, {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			resolve({ code: Number(code ?? 1), stderr, stdout });
		});
	});

	const payload = parseJsonEnvelope(result.stdout);
	if (payload?.warnings?.length) {
		for (const warning of payload.warnings) {
			console.warn(`Wolt warning: ${warning}`);
		}
	}

	if (result.code !== 0) {
		const message =
			payload?.error?.message ??
			payload?.error ??
			result.stderr.trim() ??
			`Wolt command failed with exit code ${result.code}.`;

		if (shouldRetry(message) && attempt < MAX_RETRIES) {
			const delayMs = retryDelay(attempt);
			console.warn(`Wolt rate limit hit. Retrying in ${delayMs}ms...`);
			await sleep(delayMs);
			return runWoltJson(
				{ commandArgs, locale, profileName, woltCli },
				attempt + 1,
			);
		}

		throw new Error(message);
	}

	if (payload?.error) {
		const message = payload.error.message ?? payload.error;
		if (
			typeof message === 'string' &&
			shouldRetry(message) &&
			attempt < MAX_RETRIES
		) {
			const delayMs = retryDelay(attempt);
			console.warn(`Wolt rate limit hit. Retrying in ${delayMs}ms...`);
			await sleep(delayMs);
			return runWoltJson(
				{ commandArgs, locale, profileName, woltCli },
				attempt + 1,
			);
		}
		throw new Error(
			typeof message === 'string' ? message : JSON.stringify(message),
		);
	}

	return payload?.data ?? null;
}

export function sleep(delayMs) {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}

function parseJsonEnvelope(stdout) {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return null;
	}

	try {
		return JSON.parse(trimmed);
	} catch (error) {
		throw new Error(
			`Wolt CLI returned non-JSON output. ${error instanceof Error ? error.message : String(error)}\n${trimmed}`,
			{ cause: error },
		);
	}
}

function shouldRetry(message) {
	return /status 429\b/i.test(message) || /rate limit/i.test(message);
}

function retryDelay(attempt) {
	return 1500 * 2 ** attempt;
}
