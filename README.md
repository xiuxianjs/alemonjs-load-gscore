# AlemonJS 加载 GsCore

将 GsCore 作为独立运行时托管，并通过其官方 HTTP/早柚协议把 AlemonJS 消息转给原生 GsCore 插件。

它不会将 Python 插件转换为 AlemonJS 插件：GsCore 插件仍在 GsCore 的 `plugins` 目录中运行，保留原有配置、数据库、热重载和插件生态。

## 配置

```yaml
alemonjs-load-gscore:
  # local：由插件安装并管理本机 GsCore（默认）
  # external：连接已部署的 GsCore
  # docker：兼容旧的容器托管模式
  runtime_mode: local
  gscore_url: http://127.0.0.1:8765
  gscore_repo: https://github.com/Genshin-bots/gsuid_core.git
  bot_id: AlemonJS
  # 可选：配置后前端管理 API 才启用令牌校验
  api_token: ''
  # GsCore 数据根目录名
  gscore_dir: GsCore
  # AlemonJS 启动时自动启动已安装的本机 GsCore
  auto_start: true
```

GsCore 必须开启 `ENABLE_HTTP=true`，因为桥接调用其 `/api/send_msg` 接口。local 模式下插件会安装并启动本机 GsCore；external 模式下 GsCore 的启动、停止和插件目录由外部部署负责。

启用 HTTP 时插件会同时确保 `WS_TOKEN` 存在，并在桥接请求中自动携带 `X-WS-Token`；也可以在插件配置中预先设置 `ws_token`。因此不需要关闭 GsCore 的接口鉴权。

首次使用 local 模式需要宿主机具备 Git 和 Python 3.11+。如果存在 `uv`、`poetry` 或 `pdm`，插件会优先使用它们；否则会自动筛选可用的 Python 3.11+，在 `<gscore_dir>/.venv` 创建独立虚拟环境并安装 GsCore 项目，不污染系统 Python。安装后源码位于 `<gscore_dir>/core`，GsCore 数据和插件使用其实际的 `<gscore_dir>/core/data`、`<gscore_dir>/core/gsuid_core/plugins`，插件日志位于 `<gscore_dir>/logs`。插件退出时会结束它拉起的本地 GsCore 子进程。

已有旧版本如果原本连接外部 GsCore，请显式设置 `runtime_mode: external` 保持原行为；要迁移到插件托管，设置为 `local` 后使用面板或 `#gs 安装`。迁移不会自动删除旧的外部服务，也不会覆盖已有 `gscore_dir` 数据。

Docker 托管仍作为可选兼容模式保留，可使用 `#gs 安装` 创建容器。

## 管理指令

- `#gs 状态`
- `#gs 安装`
- `#gs 启动` / `#gs 停止` / `#gs 重启`
- `#gs 日志`
- `#gs 启用HTTP`
- `#gs 安装插件 <Git 仓库地址>`
- `#gs 更新插件 <目录名>`
- `#gs 删除插件 <目录名>`

所有 `#gs` 管理指令仅主人可用。

## 管理 API

- `GET /api/gscore/status`：读取连接与插件状态。
- `POST /api/gscore/action`：执行管理操作。默认不限制本机前端请求；如果配置了
  `api_token`，则必须提供匹配的 `x-gscore-token` 请求头。

状态响应还会返回当前管理任务（`busy`、`busyTask`）和最近一次管理错误（`lastError`），便于面板展示和排障。
Docker 模式下，`installed` 以实际容器是否存在为准，不会因为仅创建了数据目录而误报已安装。

## 前端面板

项目采用与 `alemonjs-load-yunzai` 相同的独立 React + Vite + `@alemonjs/react-ui` 前端结构。首次安装执行 `yarn install:frontend`，之后运行 `yarn build` 会先构建 `frontend/`，再构建 AlemonJS 运行时；AlemonJS Web 页面会从插件的 `dist/` 提供 GsCore 控制台。

前端依赖固定使用 React 19.2.8，因为 `@alemonjs/react-ui@0.0.8` 的运行时组件依赖 React 19。升级或切换依赖后若仍看到 `recentlyCreatedOwnerStacks`，请删除 `frontend/node_modules` 后重新执行 `yarn install:frontend`。

external 模式的面板提供连接状态、服务地址、控制台跳转、自动刷新和 API Token 保存。GsCore 的启动、停止和插件维护仍需在外部 GsCore 环境完成。

复制时带来的 Yunzai 专用前端已移除，避免它继续调用已不存在的 Yunzai API。
