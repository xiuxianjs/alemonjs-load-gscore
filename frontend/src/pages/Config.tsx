import {useEffect, useState} from "react";
import {getApiToken, getConfig, getStatus, saveConfig, setApiToken} from "../api/web-api";

export default function Config() {
  const [token, setToken] = useState(getApiToken());
  const [text, setText] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState("");
  const [authEnabled, setAuthEnabled] = useState(false);
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
    void getStatus().then(status => setAuthEnabled(status.managementAuthEnabled)).catch(() => undefined);
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
