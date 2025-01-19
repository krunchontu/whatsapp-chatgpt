const puppeteer = require("puppeteer");

(async () => {
	try {
		const browser = await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"]
		});
		console.log("Chromium launched successfully!");
		await browser.close();
	} catch (error) {
		console.error("Error launching chromium:", error);
	}
})();
