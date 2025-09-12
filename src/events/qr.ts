import qrcode from "qrcode";
import * as cli from "../cli/ui";

function onQRReceived(qr: string) {
	const qrTime = new Date();
	console.log("");
	console.debug(`[DEBUG] QR received at: ${qrTime.toISOString()}`);
	qrcode.toString(
		qr,
		{
			type: "terminal",
			small: true,
			margin: 2,
			scale: 1
		},
		(err, url) => {
			if (err) throw err;
			cli.printQRCode(url);
		}
	);
}

export { onQRReceived };
