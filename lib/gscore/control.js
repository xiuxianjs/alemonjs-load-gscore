import { manager } from "./manager.js";

//#region src/gscore/control.ts
const backgroundActions = [
	"install",
	"save-config",
	"start",
	"stop",
	"restart",
	"enable-http",
	"install-plugin",
	"update-plugin",
	"remove-plugin"
];
async function runGSCoreAction(action, payload = {}) {
	switch (action) {
		case "status": return manager.status();
		case "logs": return manager.logs(typeof payload.file === "string" ? payload.file : void 0, Number(payload.lines ?? 400));
		case "get-config": return manager.getConfig();
		case "save-config":
			await manager.saveConfig(payload.config);
			return manager.status();
		case "install":
			await manager.install();
			return manager.status();
		case "start":
			await manager.start();
			return manager.status();
		case "stop":
			await manager.stop();
			return manager.status();
		case "restart":
			await manager.restart();
			return manager.status();
		case "enable-http":
			await manager.enableHTTP();
			return manager.status();
		case "install-plugin":
			await manager.installPlugin(String(payload.repository ?? ""));
			return manager.status();
		case "update-plugin":
			await manager.updatePlugin(String(payload.name ?? ""));
			return manager.status();
		case "remove-plugin":
			await manager.removePlugin(String(payload.name ?? ""));
			return manager.status();
	}
}
function runGSCoreActionInBackground(action, payload = {}) {
	runGSCoreAction(action, payload).catch(() => {});
}

//#endregion
export { backgroundActions, runGSCoreAction, runGSCoreActionInBackground };