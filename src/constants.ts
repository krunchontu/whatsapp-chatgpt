interface IConstants {
	// WhatsApp status broadcast
	statusBroadcast: string;

	// WhatsApp session storage
	sessionPath: string;
}

const constants: IConstants = {
	statusBroadcast: "status@broadcast",
	sessionPath: process.env.SESSION_PATH ?? "./session"
};

export default constants;
