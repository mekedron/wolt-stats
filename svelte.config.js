import adapter from '@sveltejs/adapter-static';

const isDev = process.env.NODE_ENV === 'development';
const base = process.env.BASE_PATH ?? (isDev ? '' : '/wolt-stats');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
		}),
		paths: {
			base,
		},
		prerender: {
			handleHttpError: 'warn',
		},
	},
};

export default config;
