export const THEME_STORAGE_KEY = 'wolt-stats-theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type AppliedTheme = 'light' | 'dark';

export function normalizeThemePreference(
	value: string | null | undefined,
): ThemePreference {
	return value === 'light' || value === 'dark' || value === 'system'
		? value
		: 'system';
}

export function resolveAppliedTheme(
	preference: ThemePreference,
	systemPrefersDark: boolean,
): AppliedTheme {
	if (preference === 'system') {
		return systemPrefersDark ? 'dark' : 'light';
	}

	return preference;
}

export function resolveThemeColor(theme: AppliedTheme) {
	return theme === 'dark' ? '#00131B' : '#57BFE4';
}
