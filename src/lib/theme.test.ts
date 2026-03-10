import { describe, expect, it } from 'vitest';

import {
	normalizeThemePreference,
	resolveAppliedTheme,
	resolveThemeColor,
} from '$lib/theme';

describe('theme helpers', () => {
	it('normalizes invalid values to system', () => {
		expect(normalizeThemePreference(undefined)).toBe('system');
		expect(normalizeThemePreference(null)).toBe('system');
		expect(normalizeThemePreference('sepia')).toBe('system');
	});

	it('keeps valid theme preferences', () => {
		expect(normalizeThemePreference('system')).toBe('system');
		expect(normalizeThemePreference('light')).toBe('light');
		expect(normalizeThemePreference('dark')).toBe('dark');
	});

	it('resolves applied theme from preference and system state', () => {
		expect(resolveAppliedTheme('light', true)).toBe('light');
		expect(resolveAppliedTheme('dark', false)).toBe('dark');
		expect(resolveAppliedTheme('system', false)).toBe('light');
		expect(resolveAppliedTheme('system', true)).toBe('dark');
	});

	it('returns theme-color values for light and dark modes', () => {
		expect(resolveThemeColor('light')).toBe('#57BFE4');
		expect(resolveThemeColor('dark')).toBe('#00131B');
	});
});
