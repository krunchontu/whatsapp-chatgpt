import * as cli from "../cli/ui";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'events:loading' });

function onLoadingScreen(percent: string) {
	if (percent == "0") {
		logger.debug({ percent }, 'WhatsApp loading screen started');
		cli.printLoading();
	}
}

export { onLoadingScreen };
