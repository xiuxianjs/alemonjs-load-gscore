import { Format, ResultCode, logger, sendToChannel, sendToUser, useMessage } from "alemonjs";

//#region src/gscore/delivery.ts
function append(format, item) {
	if (item.type === "text" || item.type === "markdown") format.addText(String(item.data ?? ""));
	else if (item.type === "at") format.addMention(String(item.data ?? ""));
	else if (item.type === "image") {
		const image = item.data;
		format.addImage(typeof image === "string" ? image : String(image?.content ?? ""));
	} else if (item.type === "record" || item.type === "audio") format.addAudio(String(item.data?.content ?? item.data ?? ""));
	else if (item.type === "video") format.addVideo(String(item.data?.content ?? item.data ?? ""));
	else if (item.type === "file") format.addText(`[文件] ${String(item.data?.content ?? item.data ?? "")}`);
	else if (item.type === "node" && Array.isArray(item.data)) for (const child of item.data) append(format, child);
	else if (item.type.startsWith("log_")) {
		const level = item.type.slice(4);
		logger[level]?.(`[GsCore] ${String(item.data ?? "")}`);
	} else if (item.type === "buttons") {
		const values = Array.isArray(item.data) ? item.data : [item.data];
		format.addText(values.flat(Infinity).map((value) => `[${String(value?.text ?? value?.label ?? "按钮")}]`).join(" "));
	} else logger.debug(`[GsCore] 忽略不支持的消息类型：${item.type}`);
}
function toFormat(content) {
	const format = Format.create();
	for (const item of content) append(format, item);
	return format;
}
function sent(results) {
	return Array.isArray(results) && results.some((result) => result && typeof result === "object" && result.code === ResultCode.Ok);
}
async function replyToSourceEvent(event, format) {
	const [message] = useMessage(event);
	await message.send({ format });
}
async function deliver(reply, event) {
	const format = toFormat(reply.content ?? []);
	if (!format.value.length) return;
	const targetID = String(reply.target_id ?? "");
	const targetType = String(reply.target_type ?? "");
	if ((targetType === "direct" || targetType === "private") && targetID) {
		if (sent(await sendToUser(targetID, format.value))) return;
		if (event) {
			logger.debug("[GsCore] 主动私聊发送未返回成功结果，已回退为关联事件回复");
			await replyToSourceEvent(event, format);
			return;
		}
		logger.warn("[GsCore] 私聊主动消息未返回成功结果，缺少关联入站消息，无法安全回退");
		return;
	}
	if (targetID && targetType) {
		if (sent(await sendToChannel(targetID, format.value))) return;
		if (event) {
			logger.debug("[GsCore] 主动频道发送未返回成功结果，已回退为关联事件回复");
			await replyToSourceEvent(event, format);
			return;
		}
		logger.warn("[GsCore] 频道主动消息未返回成功结果，缺少关联入站消息，无法安全回退");
		return;
	}
	if (!event) {
		logger.warn("[GsCore] 主动消息缺少 target_type/target_id，且未找到对应入站消息，已丢弃");
		return;
	}
	await replyToSourceEvent(event, format);
}

//#endregion
export { deliver };