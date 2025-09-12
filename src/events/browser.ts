function onBrowserLaunched() {
	const launchTime = new Date();
	console.log("Chromium browser successfully launched");
	console.debug(`[DEBUG] Browser launch time: ${launchTime.toISOString()}`);
}

export { onBrowserLaunched };
