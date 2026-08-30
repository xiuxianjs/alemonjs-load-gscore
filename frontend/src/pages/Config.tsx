import {useEffect, useState} from "react";
import {addOwnerClaim, getApiToken, getConfig, getOwnerClaims, getStatus, saveConfig, setApiToken, setTransport, startOwnerClaim} from "../api/web-api";
import type {OwnerClaim} from "../types";

export default function Config() {
  const [token, setToken] = useState(getApiToken());
  const [text, setText] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState("");
  const [authEnabled, setAuthEnabled] = useState(false);
  const [transport, setTransportState] = useState<"websocket" | "http">("websocket");
  const [ownerClaims, setOwnerClaims] = useState<OwnerClaim[]>([]);
  const [ownerClaimUntil, setOwnerClaimUntil] = useState<number | null>(null);
  const applyConfig = (config: Record<string, unknown>) => {
    setText(JSON.stringify(config, null, 2));
    setRegisterCode(typeof config.REGISTER_CODE === "string" ? config.REGISTER_CODE : "");
  };
  const handleTextChange = (value: string) => {
    setText(value);
    try {
      const config = JSON.parse(value) as Record<string, unknown>;
      if (config && typeof config === "object" && !Array.isArray(config)) {
        setRegisterCode(typeof config.REGISTER_CODE === "string" ? config.REGISTER_CODE : "");
      }
    } catch {
      // JSON 编辑过程中允许暂时处于无效状态，保存时再提示。
    }
  };
  const updateRegisterCode = (value: string) => {
    setRegisterCode(value);
    try {
      const config = JSON.parse(text) as Record<string, unknown>;
      if (!config || typeof config !== "object" || Array.isArray(config)) return;
      config.REGISTER_CODE = value;
      setText(JSON.stringify(config, null, 2));
    } catch {
      // JSON 无效时保留输入值，用户修复 JSON 后再保存。
    }
  };
  useEffect(() => {
    let disposed = false;
    setLoading("load");
    void getConfig()
      .then((config) => {
        if (!disposed) {
          applyConfig(config);
          setNotice("");
        }
      })
      .catch((error) => {
        if (!disposed)
          setNotice(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!disposed) setLoading("");
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    void getStatus().then(status => { setAuthEnabled(status.managementAuthEnabled); setTransportState(status.transport); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    let disposed = false;
    const loadClaims = () => void getOwnerClaims().then(state => { if (!disposed) { setOwnerClaims(state.claims); setOwnerClaimUntil(state.activeUntil); } }).catch(error => { if (!disposed) setNotice(error instanceof Error ? error.message : String(error)); });
    loadClaims();
    const timer = window.setInterval(loadClaims, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  const run = async (kind: "load" | "save") => {
    setLoading(kind);
    try {
      if (kind === "load") applyConfig(await getConfig());
      else {
        const config = JSON.parse(text) as unknown;
        if (!config || typeof config !== "object" || Array.isArray(config))
          throw new Error("配置必须是 JSON 对象");
        const status = await saveConfig(config as Record<string, unknown>);
        setNotice(status.restartRequired ? "配置已保存；当前 GsCore 不受插件托管，请在原运行环境重启后使配置生效。" : "配置已保存");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading("");
    }
  };
  const updateTransport = async (value: "websocket" | "http") => {
    setLoading("transport");
    try {
      const status = await setTransport(value);
      setTransportState(status.transport);
      setNotice(value === "websocket" ? "已切换为 WebSocket Adapter。请确认 GsCore 的 WS_TOKEN 已配置。" : "已切换为 HTTP 兼容模式。请确认 GsCore 已启用 ENABLE_HTTP=true。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading("");
    }
  };
  const addMaster = async (claim: OwnerClaim) => {
    setLoading(`master:${claim.userId}`);
    try {
      await addOwnerClaim(claim.userId);
      setOwnerClaims(current => current.filter(item => item.userId !== claim.userId));
      setNotice(`已将 ${claim.userName || claim.userId} 添加为 GsCore 主人。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading("");
    }
  };
  const beginOwnerClaim = async () => {
    setLoading("owner-claim");
    try {
      setOwnerClaims([]);
      setOwnerClaimUntil(await startOwnerClaim());
      setNotice('主人认领已开启，请让用户在 5 分钟内私聊机器人发送“/我是主人”。收到后仍需在此手动确认添加。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading("");
    }
  };
  return (
    <div className="page-body">
      {notice && <div className="notice">{notice}</div>}
      <section className="card config-card">
        <div className="section-title"><h2>GsCore 配置</h2><div className="action-row top-actions"><button
            className="button"
            disabled={Boolean(loading)}
            onClick={() => void run("load")}
          >
            {loading === "load" ? "读取中…" : "重新读取"}
          </button><button
            className="button primary"
            disabled={!text.trim() || Boolean(loading)}
            onClick={() => void run("save")}
          >
            {loading === "save" ? "保存中…" : "保存配置"}
          </button></div></div>
        <textarea
          aria-label="GsCore 配置 JSON"
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          placeholder={loading === "load" ? "正在读取配置…" : "暂无配置内容"}
        />
      </section>
      <section className="card register-code-card">
        <div>
          <h2>REGISTER_CODE</h2>
          <p className="muted">用于首次注册 WebConsole 管理员账号，只能注册一个管理员，不是登录密码。</p>
        </div>
        <input
          aria-label="REGISTER_CODE"
          type="text"
          value={registerCode}
          onChange={(event) => updateRegisterCode(event.target.value)}
          placeholder="未设置"
        />
      </section>
      <section className="card">
        <h2>添加 GsCore 主人</h2>
        <p className="muted">先开启认领，再让要授权的用户私聊机器人发送“/我是主人”。平台 UserId 会在此处自动出现；只有点击“添加为主人”后才会写入 GsCore 的 masters。频道或群聊发送不会登记。</p>
        <div className="action-row"><button className="button primary" disabled={Boolean(loading)} onClick={() => void beginOwnerClaim()}>{loading === 'owner-claim' ? '开启中…' : '开启认领（5 分钟）'}</button>{ownerClaimUntil && <span className="muted">认领进行中，截止 {new Date(ownerClaimUntil).toLocaleTimeString()}。</span>}</div>
        {ownerClaims.length ? ownerClaims.map(claim => <div className="action-row" key={claim.userId}><span className="muted">{claim.userName || '未命名用户'}：{claim.userId}</span><button className="button primary" disabled={Boolean(loading)} onClick={() => void addMaster(claim)}>{loading === `master:${claim.userId}` ? '添加中…' : '添加为主人'}</button></div>) : <p className="muted">{ownerClaimUntil ? '等待“/我是主人”请求…' : '尚未开启认领。'}</p>}
      </section>
      <section className="card">
        <h2>桥接传输</h2>
        <p className="muted">WebSocket 是推荐方式，支持 GsCore 主动消息；HTTP 仅用于兼容旧部署。</p>
        <select aria-label="桥接传输" value={transport} disabled={Boolean(loading)} onChange={(event) => void updateTransport(event.target.value as "websocket" | "http")}>
          <option value="websocket">WebSocket（推荐，需要 WS_TOKEN）</option>
          <option value="http">HTTP（兼容，需要 ENABLE_HTTP=true）</option>
        </select>
      </section>
      <section className="card">
        <h2>权限说明</h2>
        <p className="muted">AlemonJS 的主人权限只用于保护 #gs 管理指令。若某个 GsCore 插件本身要求主人权限，还需在此配置 JSON 的 masters 中填写对应平台用户 ID；插件不会自动同步该名单，避免误改 GsCore 的授权策略。</p>
      </section>
      <section className="card token">
        <h2>管理 API Token</h2>
        <p className="muted">{authEnabled ? "已启用 Token 校验。" : "默认不限制管理 API；如果面板会被其他设备访问，建议配置 Token。"}</p>
        <input
          type="password"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            setApiToken(event.target.value);
          }}
          placeholder="可选：x-gscore-token"
        />
      </section>
    </div>
  );
}
