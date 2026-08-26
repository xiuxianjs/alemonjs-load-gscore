//#region src/gscore/actions.ts
const actions = /* @__PURE__ */ new Set([
	"status",
	"logs",
	"get-config",
	"save-config",
	"install",
	"start",
	"stop",
	"restart",
	"enable-http",
	"install-plugin",
	"update-plugin",
	"remove-plugin"
]);
function isGSCoreAction(value) {
	return typeof value === "string" && actions.has(value);
}

//#endregion
export { isGSCoreAction };