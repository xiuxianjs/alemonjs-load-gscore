import { getBotID } from "../path.js";
import { manager } from "./manager.js";
import { deliver } from "./delivery.js";
import { toMessageReceive } from "./protocol.js";
import { logger } from "alemonjs";

//#region src/gscore/bridge.ts
var bridge_default = async (event, next) => {
	try {
		const message = toMessageReceive(event, getBotID());
		if (manager.transport === "websocket") await manager.send(message, event);
		else {
			if (!manager.isReady && !await manager.refresh(true)) {
				next();
				return;
			}
			const reply = await manager.send(message, event);
			if (reply) await deliver(reply, event);
		}
	} catch (error) {
		logger.warn(`[GsCore] 消息桥接失败：${error instanceof Error ? error.message : String(error)}`);
	}
	next();
};

//#endregion
export { bridge_default as default };