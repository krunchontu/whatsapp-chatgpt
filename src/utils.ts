import { MessageMedia } from "whatsapp-web.js";

const startsWithIgnoreCase = (str: string, prefix: string): boolean => str.toLowerCase().startsWith(prefix.toLowerCase());

const convertMediaToBase64 = async (media: MessageMedia): Promise<string> => {
	const buffer = Buffer.from(media.data, "base64");
	return `data:${media.mimetype};base64,${buffer.toString("base64")}`;
};

const isImageMedia = (media: MessageMedia): boolean => {
	return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(media.mimetype);
};

export { startsWithIgnoreCase, convertMediaToBase64, isImageMedia };
