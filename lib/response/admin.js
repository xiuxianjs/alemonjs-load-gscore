import { manager } from "../gscore/manager.js";
import { backgroundActions, runGSCoreAction, runGSCoreActionInBackground } from "../gscore/control.js";
import { Format, useEvent, useMessage } from "alemonjs";

//#region src/response/admin.ts
const help = [
	"#gs 状态",
	"#gs 安装",
	"#gs 启动 / 停止 / 重启",
	"#gs 日志",
	"#gs 启用http",
	"#gs 安装插件 <Git 仓库>",
	"#gs 更新插件 <目录名>",
	"#gs 删除插件 <目录名>"
].join("\n");
var admin_default = async () => {
	const [event, next] = useEvent();
	const current = event.current;
	if (!current.IsMaster) {
		next();
		return;
	}
	const [message] = useMessage();
	const command = current.MessageText.replace(/^(\/|#|＃)gs\s*/i, "").trim();
	const reply = (text) => message.send({ format: Format.create().addText(text) });
	let action = "status";
	let payload = {};
	if (command === "状态") action = "status";
	else if (command === "日志") action = "logs";
	else if (command === "安装") action = "install";
	else if (command === "启动") action = "start";
	else if (command === "停止") action = "stop";
	else if (command === "重启") action = "restart";
	else if (/^启用\s*https?$/i.test(command)) action = "enable-http";
	else if (command.startsWith("安装插件")) {
		action = "install-plugin";
		payload = { repository: command.slice(4).trim() };
	} else if (command.startsWith("更新插件")) {
		action = "update-plugin";
		payload = { name: command.slice(4).trim() };
	} else if (command.startsWith("删除插件")) {
		action = "remove-plugin";
		payload = { name: command.slice(4).trim() };
	} else {
		await reply(help);
		return;
	}
	try {
		if (action === "enable-http" && manager.transport === "websocket") {
			await reply("当前已使用 WebSocket，无需启用 ENABLE_HTTP。若需兼容 HTTP，请在管理面板的配置页切换传输方式。");
			return;
		}
		if (backgroundActions.includes(action)) {
			if (manager.isBusy) throw new Error(`正在${manager.busyTask}，请等待完成`);
			runGSCoreActionInBackground(action, payload);
			await reply(`GsCore：已提交“${command || action}”任务，请稍后使用 #gs 状态或前端查看进度。`);
			return;
		}
		const status = await runGSCoreAction(action, payload);
		await reply(action === "logs" ? "GsCore：日志已准备，可通过前端查看" : `GsCore：${status.message}`);
	} catch (error) {
		await reply(`GsCore 操作失败：${error instanceof Error ? error.message : String(error)}`);
	}
};

//#endregion
export { admin_default as default };