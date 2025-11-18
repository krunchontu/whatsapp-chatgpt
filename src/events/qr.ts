import qrcode from "qrcode";
import * as cli from "../cli/ui";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'events:qr' });

function onQRReceived(qr: string) {
	const qrTime = new Date();
	logger.info({ timestamp: qrTime.toISOString() }, 'QR code received for authentication');

	console.log("");
	qrcode.toString(
		qr,
		{
			type: "terminal",
			small: true,
			margin: 2,
			scale: 1
		},
		(err, url) => {
			if (err) {
				logger.error({ err }, 'Failed to generate QR code');
				throw err;
			}
			cli.printQRCode(url);
		}
	);
}

export { onQRReceived };
