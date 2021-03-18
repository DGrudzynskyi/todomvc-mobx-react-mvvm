import Router from './router.svelte';

const basePath = process.env.basePath;

new Router({
	target: document.body,
	props: {
		baseUrl: basePath
	}
});