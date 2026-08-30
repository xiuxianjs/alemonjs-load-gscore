# AlemonJS 加载 GsCore

将 GsCore 作为独立运行时托管，并通过其官方 WebSocket Adapter 协议把 AlemonJS 消息转给原生 GsCore 插件。HTTP 桥接保留为兼容模式。

它不会将 Python 插件转换为 AlemonJS 插件：GsCore 插件仍在 GsCore 的 `plugins` 目录中运行，保留原有配置、数据库、热重载和插件生态。

## 配置

```yaml
alemonjs-load-gscore:
  # local：由插件安装并管理本机 GsCore（默认）
  # external：连接已部署的 GsCore
  # docker：兼容旧的容器托管模式
  runtime_mode: local
  # websocket：标准双向 Adapter（默认，支持主动消息）
  # http：兼容旧部署，需 ENABLE_HTTP=true
  transport: websocket
  gscore_url: http://127.0.0.1:8765
  gscore_repo: https://github.com/Genshin-bots/gsuid_core.git
  bot_id: AlemonJS
  # 可选：配置后前端管理 API 才启用令牌校验
  api_token: ''
  # GsCore 数据根目录名
  gscore_dir: GsCore
  # AlemonJS 启动时自动启动已安装的本机 GsCore
  auto_start: true
  # 等待 GsCore 命令处理并返回消息的最长时间（默认 30000）
  message_timeout: 30000
```

WebSocket 模式使用 `/ws/{bot_id}`，需要 `WS_TOKEN`，但不要求 `ENABLE_HTTP=true`。HTTP 模式调用 `/api/send_msg`，必须开启 `ENABLE_HTTP=true`。local 模式下插件会安装并启动本机 GsCore；external 模式下 GsCore 的启动、停止和插件目录由外部部署负责。

local 和 Docker 模式会确保 `WS_TOKEN` 存在；external 模式请在插件配置中显式设置 `ws_token`。WebSocket 使用 `token` 查询参数，HTTP 使用 `X-WS-Token`，因此不需要关闭 GsCore 的接口鉴权。

首次使用 local 模式需要宿主机具备 Git、Python 3.11+ 和至少 512MB 可用磁盘空间。安装前插件会检查仓库地址、Git、Python、磁盘空间以及目标目录，避免在不完整目录上继续安装。如果存在 `uv`、`poetry` 或 `pdm`，插件会优先使用它们；否则会自动筛选可用的 Python 3.11+，在 `<gscore_dir>/.venv` 创建独立虚拟环境并安装 GsCore 项目，不污染系统 Python。安装后源码位于 `<gscore_dir>/core`，GsCore 数据和插件使用其实际的 `<gscore_dir>/core/data`、`<gscore_dir>/core/gsuid_core/plugins`，插件日志位于 `<gscore_dir>/logs`。它是独立运行时：插件会持久化它拉起的本地进程 PID 与启动指纹，因此 AlemonJS 重启不会中断 GsCore，下次启动后仍能安全地继续停止、重启并应用配置；启动前也会先探测配置地址，已有外部 GsCore 运行时不会重复拉起第二个进程，更不会误停止它。

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

所有 `#gs` 管理指令仅主人可用。耗时操作会立即返回“已提交”，可用 `#gs 状态` 或前端查看进度。这个主人权限只保护本插件的管理入口；若 GsCore 内部插件还要求主人权限，仍需在 GsCore 的 `data/config.json` 中配置它的 `masters`，插件不会自动改写该授权名单。

## 管理 API

- `GET /api/gscore/status`：读取连接与插件状态。
- `POST /api/gscore/action`：执行管理操作。默认不限制本机前端请求；如果配置了
  `api_token`，则必须提供匹配的 `x-gscore-token` 请求头。

管理操作通过后台任务执行，前端会轮询状态直到完成；状态响应会返回当前管理任务的 `task.phase`、任务结果和最近一次错误。AlemonJS 重启后，未完成任务会标记为 `interrupted`，避免误报为成功。`busy` 和 `busyTask` 仍保留用于兼容旧面板。消息桥接在 GsCore 尚未探测就绪时会先等待一次探测，不会直接丢弃刚启动后的第一条消息。

WebSocket 模式下，GsCore 的回复和主动消息通过长连接异步送达；连接断开时会按 1、2、4、8、15、30 秒退避重连。HTTP 模式默认等待 GsCore 最多 30 秒，耗时更长的插件命令可通过 `message_timeout` 调整，范围为 5 至 120 秒。
Docker 模式下，`installed` 以实际容器是否存在为准，不会因为仅创建了数据目录而误报已安装。

## 前端面板

项目采用与 `alemonjs-load-yunzai` 相同的独立 React + Vite + `@alemonjs/react-ui` 前端结构。首次安装执行 `yarn install:frontend`，之后运行 `yarn build` 会先构建 `frontend/`，再构建 AlemonJS 运行时；AlemonJS Web 页面会从插件的 `dist/` 提供 GsCore 控制台。

前端依赖固定使用 React 19.2.8，因为 `@alemonjs/react-ui@0.0.8` 的运行时组件依赖 React 19。升级或切换依赖后若仍看到 `recentlyCreatedOwnerStacks`，请删除 `frontend/node_modules` 后重新执行 `yarn install:frontend`。

面板的“管理”页负责运行控制，“配置”页负责 GsCore 配置和 API Token，“日志”页负责日志查看，“控制台”页嵌入 GsCore 原生控制台。默认不限制管理 API；如果面板可被局域网或公网访问，建议配置 `api_token`。external 模式下 GsCore 的启动、停止和插件维护仍需在外部 GsCore 环境完成。

复制时带来的 Yunzai 专用前端已移除，避免它继续调用已不存在的 Yunzai API。
