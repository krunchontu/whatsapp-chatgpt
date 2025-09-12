import * as cli from "../cli/ui";

function onLoadingScreen(percent: string) {
	if (percent == "0") {
		cli.printLoading();
	}
}

export { onLoadingScreen };
