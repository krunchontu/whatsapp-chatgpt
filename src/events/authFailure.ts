import * as cli from "../cli/ui";

function onAuthenticationFailure() {
	cli.printAuthenticationFailure();
}

export { onAuthenticationFailure };
