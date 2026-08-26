//#region src/gscore/protocol.ts
function toMessageReceive(event, botID) {
	const content = [];
	if (event.MessageText) content.push({
		type: "text",
		data: event.MessageText
	});
	for (const media of event.MessageMedia ?? []) {
		if (!media.Url) continue;
		const type = media.Type?.toLowerCase();
		if (type === "image" || type === "audio" || type === "record" || type === "video" || type === "file") content.push({
			type: type === "record" ? "audio" : type,
			data: {
				type: "url",
				content: media.Url
			}
		});
	}
	return {
		bot_id: botID,
		bot_self_id: String(event.BotId ?? ""),
		msg_id: String(event.MessageId ?? ""),
		user_type: event.ChannelId || event.GuildId ? "group" : "direct",
		group_id: String(event.ChannelId ?? event.GuildId ?? ""),
		user_id: String(event.UserId ?? ""),
		user_pm: event.IsMaster ? 1 : 6,
		content,
		sender: {
			nickname: String(event.UserName ?? ""),
			avatar: String(event.UserAvatar ?? "")
		}
	};
}

//#endregion
export { toMessageReceive };