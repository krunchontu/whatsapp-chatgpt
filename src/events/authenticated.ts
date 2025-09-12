import * as cli from "../cli/ui";

function onAuthenticated() {
	const authTime = new Date();
	cli.printAuthenticated();
	console.debug(`[DEBUG] Authenticated at: ${authTime.toISOString()}`);
}

export { onAuthenticated };
