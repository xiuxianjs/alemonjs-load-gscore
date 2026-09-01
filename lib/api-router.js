import { getApiToken, getGSCoreURL, setTransport } from "./path.js";
import { manager } from "./gscore/manager.js";
import { backgroundActions, runGSCoreAction, runGSCoreActionInBackground } from "./gscore/control.js";
import { isGSCoreAction } from "./gscore/actions.js";
import { getOwnerClaimState, startOwnerClaimWindow } from "./gscore/owner-claim.js";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { createHash } from "node:crypto";

//#region src/api-router.ts
const apiRouter = new KoaRouter({ prefix: "/api/gscore" });
apiRouter.use(bodyParser());
const consoleAuthDiagnostics = [];
function recordConsoleAuthDiagnostic(targetPath, status, hadAuthorization) {
	if (!targetPath.startsWith("/api/auth/")) return;
	consoleAuthDiagnostics.unshift({
		at: Date.now(),
		path: targetPath,
		status,
		hadAuthorization
	});
	if (consoleAuthDiagnostics.length > 20) consoleAuthDiagnostics.length = 20;
}
function summarizeConsoleAuthDiagnostics() {
	const latest = consoleAuthDiagnostics.find((item) => item.path === "/api/auth/me");
	if (!latest) return "尚未观察到登录后的会话校验请求。请先在嵌入控制台完成一次登录，再读取诊断。";
	if (latest.status === 401 && latest.hadAuthorization) return "GsCore 收到了 Bearer 但拒绝了会话：通常是同账号新登录挤掉了旧会话，或会话已被服务端吊销。";
	if (latest.status === 401) return "浏览器发起会话校验时未携带 Bearer：请检查是否被浏览器存储策略、旧页面脚本或页面刷新清除了令牌。";
	if (latest.status >= 200 && latest.status < 300) return "最近一次登录后会话校验正常，认证链路没有发现 401。";
	return `最近一次会话校验返回 HTTP ${latest.status}，请结合 GsCore 日志进一步定位。`;
}
async function checkConsoleAuth() {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5e3);
	try {
		const response = await fetch(`${getGSCoreURL()}/api/auth/pubkey`, { signal: controller.signal });
		if (!response.ok) return {
			reachable: true,
			mode: "legacy-or-incompatible",
			message: `认证公钥端点返回 HTTP ${response.status}；该 GsCore 可能较旧或认证接口不兼容。`
		};
		const body = await response.json().catch(() => null);
		if (body?.status === 0 && body.data?.alg === "x25519-aes256gcm") return {
			reachable: true,
			mode: "encrypted-bearer-session",
			message: "已确认使用当前 GsCore 的加密登录 + Bearer 会话认证。"
		};
		return {
			reachable: true,
			mode: "legacy-or-incompatible",
			message: "GsCore 可访问，但未返回当前认证协议标识；请检查 GsCore 与控制台版本是否匹配。"
		};
	} catch (error) {
		return {
			reachable: false,
			mode: "unavailable",
			message: `无法检查 GsCore 认证协议：${error instanceof Error && error.name === "AbortError" ? "请求超时" : "无法连接"}。`
		};
	} finally {
		clearTimeout(timer);
	}
}
function rewriteConsoleLocation(location) {
	try {
		const upstream = new URL(location, getGSCoreURL());
		if (upstream.origin !== new URL(getGSCoreURL()).origin) return location;
		const suffix = `${upstream.search}${upstream.hash}`;
		if (upstream.pathname === "/app" || upstream.pathname.startsWith("/app/")) return `./${upstream.pathname.replace(/^\/app\/?/, "")}${suffix}`;
		if (upstream.pathname === "/api" || upstream.pathname.startsWith("/api/")) return `../console-api/${upstream.pathname.replace(/^\/api\/?/, "")}${suffix}`;
	} catch {}
	return location;
}
function rewriteConsoleStorageKeys(content) {
	const prefix = `alemonjs-load-gscore:${createHash("sha256").update(getGSCoreURL()).digest("hex").slice(0, 16)}:`;
	return content.replaceAll("\"auth_token\"", JSON.stringify(`${prefix}auth_token`)).replaceAll("\"auth_user\"", JSON.stringify(`${prefix}auth_user`)).replaceAll("\"custom_api_host\"", JSON.stringify(`${prefix}custom_api_host`));
}
async function proxyConsole(ctx, targetPath) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 3e4);
	try {
		const headers = {};
		const contentType = ctx.get("content-type");
		const cookie = ctx.get("cookie");
		const authorization = ctx.get("authorization");
		if (contentType) headers["content-type"] = contentType;
		if (cookie) headers.cookie = cookie;
		if (authorization) headers.authorization = authorization;
		let body;
		if (ctx.method !== "GET" && ctx.method !== "HEAD") {
			const requestBody = ctx.request.body;
			body = requestBody === void 0 ? void 0 : contentType?.includes("application/json") ? JSON.stringify(requestBody) : String(requestBody);
		}
		const upstream = await fetch(`${getGSCoreURL()}${targetPath}${ctx.search}`, {
			method: ctx.method,
			headers,
			body,
			signal: controller.signal,
			redirect: "manual"
		});
		ctx.status = upstream.status;
		const upstreamContentType = upstream.headers.get("content-type");
		if (upstreamContentType) ctx.set("content-type", upstreamContentType);
		const location = upstream.headers.get("location");
		if (location) ctx.set("location", rewriteConsoleLocation(location));
		const setCookie = upstream.headers.getSetCookie?.() ?? [];
		if (setCookie.length) ctx.set("set-cookie", setCookie.map((value) => value.replace(/Path=\/app\b/gi, "Path=/api/gscore/console").replace(/Path=\/\b/gi, "Path=/api/gscore/console")));
		const data = Buffer.from(await upstream.arrayBuffer());
		if (upstreamContentType?.includes("text/html") || upstreamContentType?.includes("javascript") || upstreamContentType?.includes("text/css")) {
			ctx.set("cache-control", "no-store");
			let rewritten = data.toString("utf8").replaceAll("/app/", "__GSCORE_APP_PATH__").replaceAll("/api/", "__GSCORE_API_PATH__").replaceAll("__GSCORE_APP_PATH__", "./").replaceAll("__GSCORE_API_PATH__", "../console-api/");
			if (upstreamContentType.includes("javascript")) rewritten = rewriteConsoleStorageKeys(rewritten);
			ctx.body = rewritten;
		} else ctx.body = data;
		recordConsoleAuthDiagnostic(targetPath, upstream.status, Boolean(authorization));
	} catch (error) {
		ctx.status = 502;
		ctx.body = {
			code: 502,
			message: error instanceof Error ? `GsCore 控制台不可用：${error.message}` : "GsCore 控制台不可用"
		};
	} finally {
		clearTimeout(timer);
	}
}
apiRouter.all("/console", async (ctx) => {
	if (ctx.path.endsWith("/")) {
		await proxyConsole(ctx, "/app/");
		return;
	}
	ctx.status = 301;
	ctx.set("location", "/api/gscore/console/");
	ctx.body = "";
});
apiRouter.all("/console/*path", async (ctx) => {
	await proxyConsole(ctx, `/app/${Array.isArray(ctx.params.path) ? ctx.params.path.join("/") : ctx.params.path ?? ""}`);
});
apiRouter.all("/console-api", async (ctx) => {
	await proxyConsole(ctx, "/api/");
});
apiRouter.all("/console-api/*path", async (ctx) => {
	await proxyConsole(ctx, `/api/${Array.isArray(ctx.params.path) ? ctx.params.path.join("/") : ctx.params.path ?? ""}`);
});
apiRouter.get("/console-diagnostics", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: {
			entries: consoleAuthDiagnostics,
			summary: summarizeConsoleAuthDiagnostics()
		}
	};
});
apiRouter.get("/console-auth-check", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: await checkConsoleAuth()
	};
});
apiRouter.get("/status", async (ctx) => {
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: await runGSCoreAction("status")
	};
});
apiRouter.get("/logs", async (ctx) => {
	const file = typeof ctx.query.file === "string" ? ctx.query.file : void 0;
	const lines = typeof ctx.query.lines === "string" ? Number(ctx.query.lines) || 400 : 400;
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: await runGSCoreAction("logs", {
			file,
			lines
		})
	};
});
apiRouter.delete("/logs/:file", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	try {
		const file = Array.isArray(ctx.params.file) ? ctx.params.file.join("") : ctx.params.file ?? "";
		ctx.status = 200;
		ctx.body = {
			code: 200,
			message: "日志已删除",
			data: manager.deleteLog(file)
		};
	} catch (error) {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: error instanceof Error ? error.message : String(error),
			data: null
		};
	}
});
apiRouter.get("/config", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: await runGSCoreAction("get-config")
	};
});
apiRouter.get("/core-command-prefix", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: manager.getCoreCommandPrefix()
	};
});
apiRouter.post("/config", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	try {
		if (manager.isBusy) {
			ctx.status = 409;
			ctx.body = {
				code: 409,
				message: `正在${manager.busyTask}，请等待完成`,
				data: null
			};
			return;
		}
		const body = ctx.request.body ?? {};
		runGSCoreActionInBackground("save-config", { config: body.config });
		ctx.status = 202;
		ctx.body = {
			code: 202,
			message: "配置保存任务已开始，请通过状态接口查看进度",
			data: await runGSCoreAction("status")
		};
	} catch (error) {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: error instanceof Error ? error.message : String(error),
			data: null
		};
	}
});
apiRouter.post("/transport", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	const transport = (ctx.request.body ?? {}).transport;
	if (transport !== "websocket" && transport !== "http") {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: "transport 必须是 websocket 或 http",
			data: null
		};
		return;
	}
	try {
		setTransport(transport);
		await manager.updateTransport();
		ctx.status = 200;
		ctx.body = {
			code: 200,
			message: "传输方式已更新",
			data: await manager.status()
		};
	} catch (error) {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: error instanceof Error ? error.message : String(error),
			data: null
		};
	}
});
apiRouter.get("/owner-claims", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "ok",
		data: getOwnerClaimState()
	};
});
apiRouter.post("/owner-claims/start", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	ctx.status = 200;
	ctx.body = {
		code: 200,
		message: "主人认领已开启",
		data: { activeUntil: startOwnerClaimWindow() }
	};
});
apiRouter.post("/owner-claims/add", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "需要有效的 x-gscore-token",
			data: null
		};
		return;
	}
	const body = ctx.request.body ?? {};
	const userId = typeof body.userId === "string" ? body.userId : "";
	try {
		await manager.addMaster(userId);
		ctx.status = 200;
		ctx.body = {
			code: 200,
			message: "已添加 GsCore 主人",
			data: {
				userId,
				restartDeferred: manager.isBusy
			}
		};
	} catch (error) {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: error instanceof Error ? error.message : String(error),
			data: null
		};
	}
});
apiRouter.post("/action", async (ctx) => {
	const token = getApiToken();
	if (token && ctx.get("x-gscore-token") !== token) {
		ctx.status = 401;
		ctx.body = {
			code: 401,
			message: "管理 API 令牌无效",
			data: null
		};
		return;
	}
	const body = ctx.request.body ?? {};
	const action = body.action;
	if (!isGSCoreAction(action)) {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: "action 无效",
			data: null
		};
		return;
	}
	try {
		if (manager.isBusy) {
			ctx.status = 409;
			ctx.body = {
				code: 409,
				message: `正在${manager.busyTask}，请等待完成`,
				data: null
			};
			return;
		}
		if (backgroundActions.includes(action)) {
			runGSCoreActionInBackground(action, body);
			ctx.status = 202;
			ctx.body = {
				code: 202,
				message: "任务已开始，请通过状态接口查看进度",
				data: await runGSCoreAction("status")
			};
			return;
		}
		ctx.status = 200;
		ctx.body = {
			code: 200,
			message: "操作完成",
			data: await runGSCoreAction(action, body)
		};
	} catch (error) {
		ctx.status = 400;
		ctx.body = {
			code: 400,
			message: error instanceof Error ? error.message : String(error),
			data: null
		};
	}
});

//#endregion
export { apiRouter as default };