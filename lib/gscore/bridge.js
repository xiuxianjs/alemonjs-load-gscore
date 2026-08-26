import { getBotID } from "../path.js";
import { manager } from "./manager.js";
import { toMessageReceive } from "./protocol.js";
import { Format, logger, sendToChannel, sendToUser, useMessage } from "alemonjs";

//#region src/gscore/bridge.ts
function append(format, item) {
	if (item.type === "text" || item.type === "markdown") format.addText(String(item.data ?? ""));
	else if (item.type === "at") format.addMention(String(item.data ?? ""));
	else if (item.type === "image") {
		const image = item.data;
		format.addImage(typeof image === "string" ? image : String(image?.content ?? ""));
	} else if (item.type === "record") format.addAudio(String(item.data ?? ""));
	else if (item.type === "video") format.addVideo(String(item.data ?? ""));
	else if (item.type === "file") format.addText(`[文件] ${String(item.data?.content ?? item.data ?? "")}`);
	else if (item.type === "node" && Array.isArray(item.data)) for (const child of item.data) append(format, child);
	else if (item.type.startsWith("log_")) {
		const level = item.type.slice(4);
		logger[level]?.(`[GsCore] ${String(item.data ?? "")}`);
	} else if (item.type === "buttons") {
		const values = Array.isArray(item.data) ? item.data : [item.data];
		format.addText(values.flat(Infinity).map((value) => `[${String(value?.text ?? value?.label ?? "按钮")}]`).join(" "));
	}
}
function toFormat(content) {
	const format = Format.create();
	for (const item of content) append(format, item);
	return format;
}
async function deliver(event, reply) {
	const format = toFormat(reply.content ?? []);
	if (!format.value.length) return;
	const targetID = String(reply.target_id ?? "");
	const targetType = String(reply.target_type ?? "");
	if ((targetType === "direct" || targetType === "private") && targetID) {
		await sendToUser(targetID, format.value);
		return;
	}
	if (targetID && targetType) {
		await sendToChannel(targetID, format.value);
		return;
	}
	const [message] = useMessage(event);
	await message.send({ format });
}
var bridge_default = async (event, next) => {
	if (!manager.isReady) {
		if (!await manager.refresh(true)) {
			next();
			return;
		}
	}
	try {
		const reply = await manager.send(toMessageReceive(event, getBotID()));
		if (reply) await deliver(event, reply);
	} catch (error) {
		logger.warn(`[GsCore] 消息桥接失败：${error instanceof Error ? error.message : String(error)}`);
	}
	next();
};

//#endregion
export { bridge_default as default };