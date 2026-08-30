import { recordOwnerClaim } from "../gscore/owner-claim.js";
import { Format, useEvent, useMessage } from "alemonjs";

//#region src/response/owner-claim.ts
var owner_claim_default = async () => {
	const [event] = useEvent();
	const current = event.current;
	const [message] = useMessage();
	const reply = (text) => message.send({ format: Format.create().addText(text) });
	if (current.GuildId || current.ChannelId) return;
	const userId = String(current.UserId ?? "").trim();
	if (!userId) {
		await reply("未读取到平台 UserId，无法登记。");
		return;
	}
	if (!recordOwnerClaim(userId, String(current.UserName ?? "").trim())) return;
	await reply("已登记你的平台 UserId。管理员仍需在 GsCore 配置页手动点击“添加为主人”，不会自动授权。");
};

//#endregion
export { owner_claim_default as default };