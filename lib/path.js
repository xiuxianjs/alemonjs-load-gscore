import { getConfigValue } from "alemonjs";
import { join } from "node:path";

//#region src/path.ts
const defaultURL = "http://127.0.0.1:8765";
const defaultRepo = "https://github.com/Genshin-bots/gsuid_core.git";
const defaultImage = "docker.cnb.cool/gscore-mirror/gsuid_core:latest";
function getConfig() {
	return (getConfigValue() ?? {})["alemonjs-load-gscore"] ?? {};
}
function getRuntimeMode() {
	const mode = getConfig().runtime_mode;
	return mode === "external" || mode === "docker" ? mode : "local";
}
function getGSCoreURL() {
	return (getConfig().gscore_url ?? defaultURL).replace(/\/$/, "");
}
function getGSCoreRepo() {
	return getConfig().gscore_repo?.trim() || defaultRepo;
}
function getBotID() {
	return getConfig().bot_id?.trim() || "AlemonJS";
}
function getWSToken() {
	return getConfig().ws_token?.trim() ?? "";
}
function getApiToken() {
	return getConfig().api_token?.trim() ?? "";
}
function getGSCoreDir() {
	const configured = getConfig().gscore_dir?.trim() || "GsCore";
	return join(process.cwd(), configured);
}
function getGSCoreCoreDir() {
	return join(getGSCoreDir(), "core");
}
function getGSCoreLogsDir() {
	return join(getGSCoreDir(), "logs");
}
function getGSCoreVenvDir() {
	return join(getGSCoreDir(), ".venv");
}
function getGSCoreVenvPython() {
	return process.platform === "win32" ? join(getGSCoreVenvDir(), "Scripts", "python.exe") : join(getGSCoreVenvDir(), "bin", "python");
}
function getPythonCommand() {
	return getConfig().python_command?.trim() || "python3";
}
function getAutoStart() {
	return getConfig().auto_start !== false;
}
function getStartupTimeout() {
	const value = Number(getConfig().startup_timeout ?? 6e4);
	return Number.isFinite(value) ? Math.min(3e5, Math.max(1e4, Math.floor(value))) : 6e4;
}
function getMessageTimeout() {
	const value = Number(getConfig().message_timeout ?? 3e4);
	return Number.isFinite(value) ? Math.min(12e4, Math.max(5e3, Math.floor(value))) : 3e4;
}
function getDataDir() {
	return getRuntimeMode() === "local" ? join(getGSCoreCoreDir(), "data") : join(getGSCoreDir(), "data");
}
function getPluginsDir() {
	return getRuntimeMode() === "local" ? join(getGSCoreCoreDir(), "gsuid_core", "plugins") : join(getGSCoreDir(), "plugins");
}
function getDockerImage() {
	return getConfig().docker_image?.trim() || defaultImage;
}
function getContainerName() {
	return `alemonjs-gscore-${getBotID().replace(/[^a-zA-Z0-9_.-]+/g, "-").toLowerCase()}`;
}
function getPort() {
	const url = new URL(getGSCoreURL());
	const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("gscore_url 端口无效");
	return port;
}

//#endregion
export { getApiToken, getAutoStart, getBotID, getContainerName, getDataDir, getDockerImage, getGSCoreCoreDir, getGSCoreDir, getGSCoreLogsDir, getGSCoreRepo, getGSCoreURL, getGSCoreVenvDir, getGSCoreVenvPython, getMessageTimeout, getPluginsDir, getPort, getPythonCommand, getRuntimeMode, getStartupTimeout, getWSToken };