import { logger } from 'alemonjs'
import { ChildProcess, execFile, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getAutoStart,
  getContainerName,
  getGSCoreCoreDir,
  getGSCoreDir,
  getDataDir,
  getDockerImage,
  getGSCoreLogsDir,
  getGSCoreRepo,
  getGSCoreURL,
  getPluginsDir,
  getPort,
  getPythonCommand,
  getGSCoreVenvPython,
  getGSCoreVenvDir,
  getRuntimeMode,
  getApiToken,
  getStartupTimeout,
  getWSToken
} from '../path'
import type { MessageReceive, MessageSend } from './types'

type Status = {
  mode: string
  installed: boolean
  running: boolean
  ready: boolean
  pid: number | null
  logFile: string | null
  busy: boolean
  busyTask: string | null
  lastError: string | null
  address: string
  console: string
  plugins: string[]
  message: string
  managementAuthEnabled: boolean
  task: TaskState | null
}

export type TaskState = {
  id: string
  action: string
  phase: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  startedAt: number
  finishedAt?: number
  error?: string
}

export type GSCoreLogs = {
  files: Array<{ name: string; size: number; updatedAt: number }>
  activeFile: string
  content: string
  truncated: boolean
}

export type GSCoreConfigData = Record<string, unknown>

function run(command: string, args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: options.cwd, timeout: options.timeout ?? 10 * 60_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${stderr.trim() || error.message}`))
      else resolve(stdout.trim())
    })
  })
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    return await fetch(`${getGSCoreURL()}${path}`, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class GSCoreManager {
  private static readonly REFRESH_INTERVAL = 3000
  private task: string | null = null
  private taskState: TaskState | null = null
  private reachable = false
  private lastError: string | null = null
  private refreshTask: Promise<boolean> | null = null
  private lastRefreshAt = 0
  private localProcess: ChildProcess | null = null
  private localLogFile: string | null = null
  private localStopRequested = false
  private localRestartCount = 0
  private localRestartTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.restoreTaskState()
    // AlemonJS 退出时一并结束由插件拉起的本地进程，避免留下失控的 GsCore。
    process.once('exit', () => {
      if (this.localProcess && !this.localProcess.killed) this.localProcess.kill('SIGTERM')
    })
  }

  get isBusy(): boolean {
    return this.task !== null
  }

  get isReady(): boolean {
    return this.reachable
  }

  get busyTask(): string | null {
    return this.task
  }

  private async withinTask<T>(name: string, operation: () => Promise<T>): Promise<T> {
    if (this.task) throw new Error(`正在${this.task}，请等待完成`)
    this.task = name
    this.taskState = { id: randomUUID(), action: name, phase: '准备中', status: 'running', startedAt: Date.now() }
    this.persistTaskState()
    this.lastError = null
    try {
      const result = await operation()
      if (this.taskState) {
        this.taskState = { ...this.taskState, phase: '已完成', status: 'completed', finishedAt: Date.now() }
        this.persistTaskState()
      }
      return result
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      if (this.taskState) {
        this.taskState = { ...this.taskState, phase: '失败', status: 'failed', finishedAt: Date.now(), error: this.lastError }
        this.persistTaskState()
      }
      throw error
    } finally {
      this.task = null
    }
  }

  private taskStatePath(): string { return join(getGSCoreDir(), '.management-task.json') }

  private persistTaskState(): void {
    if (!this.taskState) return
    try {
      mkdirSync(getGSCoreDir(), { recursive: true })
      writeFileSync(this.taskStatePath(), `${JSON.stringify(this.taskState, null, 2)}\n`, 'utf8')
    } catch (error) {
      logger.debug(`[GsCore] 无法保存管理任务状态：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private restoreTaskState(): void {
    try {
      if (!existsSync(this.taskStatePath())) return
      const state = JSON.parse(readFileSync(this.taskStatePath(), 'utf8')) as TaskState
      if (state?.status === 'running') {
        this.taskState = { ...state, status: 'interrupted', phase: '进程重启导致任务中断', finishedAt: Date.now(), error: 'AlemonJS 进程在任务完成前重启' }
        this.persistTaskState()
      } else if (state?.id && state?.action) this.taskState = state
    } catch {
      this.taskState = null
    }
  }

  private setTaskPhase(phase: string): void {
    if (!this.taskState) return
    this.taskState = { ...this.taskState, phase }
    this.persistTaskState()
  }

  private ensureDirectories(): void {
    mkdirSync(getGSCoreDir(), { recursive: true })
    mkdirSync(getGSCoreLogsDir(), { recursive: true })
    if (getRuntimeMode() !== 'local' || this.localInstalled()) {
      mkdirSync(getDataDir(), { recursive: true })
      mkdirSync(getPluginsDir(), { recursive: true })
    }
  }

  private localInstalled(): boolean {
    return existsSync(join(getGSCoreCoreDir(), 'pyproject.toml')) || existsSync(join(getGSCoreCoreDir(), 'requirements.txt'))
  }

  private async commandAvailable(command: string): Promise<boolean> {
    try {
      await run(command, ['--version'], { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  private async pythonCommand(): Promise<string> {
    const candidates = [
      getPythonCommand(),
      'python3.14', 'python3.13', 'python3.12', 'python3.11', 'python',
      '/opt/homebrew/bin/python3', '/usr/local/bin/python3'
    ]
    for (const command of [...new Set(candidates)]) {
      try {
        const version = await run(command, ['--version'], { timeout: 5000 })
        const match = version.match(/Python\s+(\d+)\.(\d+)/i)
        if (match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 11))) return command
      } catch {
        // 继续探测下一个 Python 命令。
      }
    }
    throw new Error('GsCore 需要 Python 3.11 或更高版本，请安装后配置 python_command')
  }

  private async localVenvPython(): Promise<string> {
    const venvPython = getGSCoreVenvPython()
    try {
      const version = await run(venvPython, ['--version'], { timeout: 5000 })
      const match = version.match(/Python\s+(\d+)\.(\d+)/i)
      if (match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 11))) return venvPython
    } catch {
      // 虚拟环境不存在或解释器不可用，下面重新创建。
    }
    if (existsSync(getGSCoreVenvDir())) rmSync(getGSCoreVenvDir(), { recursive: true, force: true })
    const systemPython = await this.pythonCommand()
    await run(systemPython, ['-m', 'venv', getGSCoreVenvDir()], { cwd: getGSCoreCoreDir(), timeout: 5 * 60_000 })
    return venvPython
  }

  private async localCommand(): Promise<{ command: string; args: string[] }> {
    if (await this.commandAvailable('uv')) return { command: 'uv', args: ['run', 'core'] }
    if (await this.commandAvailable('poetry')) return { command: 'poetry', args: ['run', 'core'] }
    if (await this.commandAvailable('pdm')) return { command: 'pdm', args: ['run', 'core'] }
    if (existsSync(getGSCoreVenvPython())) return { command: getGSCoreVenvPython(), args: ['-m', 'gsuid_core.core'] }
    return { command: await this.pythonCommand(), args: ['-m', 'gsuid_core.core'] }
  }

  private async prepareLocalDependencies(): Promise<void> {
    const coreDir = getGSCoreCoreDir()
    if (await this.commandAvailable('uv')) {
      await run('uv', ['sync'], { cwd: coreDir, timeout: 20 * 60_000 })
      return
    }
    if (await this.commandAvailable('poetry')) {
      await run('poetry', ['install'], { cwd: coreDir, timeout: 20 * 60_000 })
      return
    }
    if (await this.commandAvailable('pdm')) {
      await run('pdm', ['install'], { cwd: coreDir, timeout: 20 * 60_000 })
      return
    }
    if (existsSync(join(coreDir, 'pyproject.toml'))) {
      const python = await this.localVenvPython()
      await run(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: coreDir, timeout: 10 * 60_000 })
      await run(python, ['-m', 'pip', 'install', '.'], { cwd: coreDir, timeout: 30 * 60_000 })
      return
    }
    if (existsSync(join(coreDir, 'requirements.txt'))) {
      const python = await this.localVenvPython()
      await run(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: coreDir, timeout: 10 * 60_000 })
      await run(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: coreDir, timeout: 20 * 60_000 })
      return
    }
    throw new Error('未找到可用的 GsCore 项目配置，无法准备 Python 依赖')
  }

  private appendLocalLog(chunk: unknown): void {
    if (!this.localLogFile) return
    try { appendFileSync(this.localLogFile, String(chunk), 'utf8') } catch { return }
  }

  private writeHTTPConfig(): void {
    const path = join(getDataDir(), 'config.json')
    let config: Record<string, unknown> = {}
    if (existsSync(path)) {
      try { config = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch {
        throw new Error('GsCore data/config.json 不是有效 JSON，无法安全修改')
      }
    }
    config.ENABLE_HTTP = true
    config.WS_TOKEN = getWSToken() || (typeof config.WS_TOKEN === 'string' && config.WS_TOKEN.trim() ? config.WS_TOKEN : randomBytes(24).toString('hex'))
    const temporaryPath = `${path}.tmp-${process.pid}`
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
      renameSync(temporaryPath, path)
    } finally {
      if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true })
    }
  }

  private async startLocalProcess(): Promise<void> {
    if (this.localProcess && !this.localProcess.killed) {
      await this.waitForReady()
      return
    }
    if (!this.localInstalled()) throw new Error('GsCore 尚未安装，请先执行安装')
    if (await this.refresh(true)) {
      throw new Error('GsCore 已在配置地址运行，当前进程不是本插件启动的；请勿重复启动，或先切换为 external 模式')
    }
    this.ensureDirectories()
    const { command, args } = await this.localCommand()
    this.localStopRequested = false
    this.localLogFile = join(getGSCoreLogsDir(), `gscore-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
    this.appendLocalLog(`[AlemonJS] 启动命令: ${command} ${args.join(' ')}\n`)
    const child = spawn(command, args, {
      cwd: getGSCoreCoreDir(),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        DATA_PATH: getDataDir(),
        PLUGIN_PATH: getPluginsDir()
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.localProcess = child
    child.stdout?.on('data', chunk => this.appendLocalLog(chunk))
    child.stderr?.on('data', chunk => this.appendLocalLog(chunk))
    child.once('error', error => {
      this.appendLocalLog(`[AlemonJS] 进程错误: ${error.message}\n`)
      logger.error(`[GsCore] 本地进程错误：${error.message}`)
    })
    child.once('exit', (code, signal) => {
      this.appendLocalLog(`[AlemonJS] 进程退出 code=${String(code)} signal=${String(signal)}\n`)
      if (this.localProcess === child) {
        this.localProcess = null
        this.reachable = false
      }
      if (code !== 0 && signal !== 'SIGTERM') {
        logger.warn(`[GsCore] 本地进程已退出 code=${String(code)} signal=${String(signal)}`)
        if (!this.localStopRequested && getAutoStart() && this.localRestartCount < 3) {
          this.localRestartCount++
          this.appendLocalLog(`[AlemonJS] 将在 2 秒后自动重启（第 ${this.localRestartCount}/3 次）\n`)
          this.localRestartTimer = setTimeout(() => {
            this.localRestartTimer = null
            void this.start().catch(error => logger.error(`[GsCore] 自动重启失败：${error instanceof Error ? error.message : String(error)}`))
          }, 2000)
        }
      }
    })
    await this.waitForReady()
  }

  private async stopLocalProcess(): Promise<void> {
    if (this.localRestartTimer) {
      clearTimeout(this.localRestartTimer)
      this.localRestartTimer = null
    }
    this.localStopRequested = true
    const child = this.localProcess
    if (!child || child.killed) {
      if (await this.refresh(true)) throw new Error('当前 GsCore 不是本插件启动的进程，无法安全停止；请在原托管进程中停止，或切换为 external 模式')
      this.localProcess = null
      this.reachable = false
      return
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      this.localProcess = null
      this.reachable = false
      return
    }
    await new Promise<void>(resolve => {
      let settled = false
      const finish = () => { if (!settled) { settled = true; resolve() } }
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish() }, 10_000)
      child.once('exit', () => { clearTimeout(timer); finish() })
      child.kill('SIGTERM')
    })
    this.localProcess = null
    this.reachable = false
  }

  private dockerInstalled(): Promise<void> {
    return run('docker', ['version', '--format', '{{.Server.Version}}']).then(() => undefined)
  }

  private async containerExists(): Promise<boolean> {
    try {
      await run('docker', ['inspect', '--format', '{{.Id}}', getContainerName()])
      return true
    } catch {
      return false
    }
  }

  async refresh(force = false): Promise<boolean> {
    if (!force && Date.now() - this.lastRefreshAt < GSCoreManager.REFRESH_INTERVAL) {
      return this.reachable
    }
    if (this.refreshTask) return this.refreshTask
    this.refreshTask = (async () => {
      try {
        const response = await request('/app')
        this.reachable = response.ok || response.status === 302
      } catch {
        this.reachable = false
      } finally {
        this.lastRefreshAt = Date.now()
        this.refreshTask = null
      }
      return this.reachable
    })()
    return this.refreshTask
  }

  async status(): Promise<Status> {
    const running = await this.refresh(true)
    const mode = getRuntimeMode()
    // external 模式的“安装”由外部部署负责，服务暂时离线不代表未安装。
    const installed = mode === 'local' ? this.localInstalled() : mode === 'external' ? true : await this.containerExists()
    const processRunning = mode === 'local'
      ? Boolean(this.localProcess && !this.localProcess.killed && this.localProcess.exitCode === null && this.localProcess.signalCode === null) || running
      : running
    const ready = running
    const plugins = (mode === 'local' || mode === 'docker') && existsSync(getPluginsDir())
      ? readdirSync(getPluginsDir(), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
      : []
    return {
      mode,
      installed,
      running: processRunning,
      ready,
      pid: mode === 'local' ? (this.localProcess?.pid ?? null) : null,
      logFile: this.localLogFile,
      busy: this.isBusy,
      busyTask: this.task,
      lastError: this.lastError,
      address: getGSCoreURL(),
      console: `${getGSCoreURL()}/app`,
      plugins,
      message: ready ? 'GsCore 已连接。' : processRunning ? 'GsCore 进程正在启动，尚未就绪。' : installed ? 'GsCore 未运行。' : 'GsCore 尚未安装。',
      managementAuthEnabled: Boolean(getApiToken()),
      task: this.taskState
    }
  }

  logs(fileName?: string, maxLines = 400): GSCoreLogs {
    this.ensureDirectories()
    maxLines = Number.isFinite(maxLines) ? Math.min(2000, Math.max(1, Math.floor(maxLines))) : 400
    const files = readdirSync(getGSCoreLogsDir())
      .filter(name => name.endsWith('.log'))
      .map(name => {
        const path = join(getGSCoreLogsDir(), name)
        const stat = statSync(path)
        return { name, size: stat.size, updatedAt: stat.mtimeMs }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const activeFile = fileName && files.some(file => file.name === fileName) ? fileName : (files[0]?.name ?? '')
    if (!activeFile) return { files, activeFile: '', content: '', truncated: false }
    const lines = readFileSync(join(getGSCoreLogsDir(), activeFile), 'utf8').replace(/\r\n/g, '\n').split('\n')
    const truncated = lines.length > maxLines
    return { files, activeFile, content: truncated ? lines.slice(-maxLines).join('\n') : lines.join('\n'), truncated }
  }

  getConfig(): GSCoreConfigData {
    const path = join(getDataDir(), 'config.json')
    if (!existsSync(path)) return {}
    try {
      const config = JSON.parse(readFileSync(path, 'utf8')) as unknown
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('配置必须是 JSON 对象')
      return config as GSCoreConfigData
    } catch (error) {
      throw new Error(`GsCore 配置无效：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async saveConfig(config: GSCoreConfigData): Promise<void> {
    await this.withinTask('保存 GsCore 配置', async () => {
      if (getRuntimeMode() === 'external') throw new Error('external 模式请在 GsCore 所在环境中修改配置')
      if (getRuntimeMode() === 'local' && !this.localInstalled()) throw new Error('GsCore 尚未安装，请先执行安装')
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('配置必须是 JSON 对象')
      this.ensureDirectories()
      const path = join(getDataDir(), 'config.json')
      const temporaryPath = `${path}.tmp-${process.pid}`
      try {
        writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
        renameSync(temporaryPath, path)
      } finally {
        if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true })
      }
      if (getRuntimeMode() === 'local' && this.localProcess) {
        await this.stopLocalProcess()
        await this.startLocalProcess()
        logger.info('[GsCore] 配置已保存，并已重启本地 GsCore 使配置生效')
      }
    })
  }

  async install(): Promise<void> {
    await this.withinTask('安装 GsCore', async () => {
      if (getRuntimeMode() === 'local') {
        if (this.localInstalled()) throw new Error('GsCore 已安装')
        this.setTaskPhase('检查 Git、Python 和磁盘空间')
        this.ensureDirectories()
        await this.checkLocalInstallEnvironment()
        try {
          this.setTaskPhase('下载 GsCore 源码')
          await run('git', ['clone', '--depth', '1', '--single-branch', getGSCoreRepo(), getGSCoreCoreDir()])
          logger.info(`[GsCore] 本地源码已下载到 ${getGSCoreCoreDir()}，开始准备 Python 依赖`)
          this.setTaskPhase('安装 Python 依赖（可能需要几分钟）')
          await this.prepareLocalDependencies()
          logger.info('[GsCore] Python 依赖已准备完成，正在写入 HTTP 配置')
          this.setTaskPhase('写入 HTTP 配置')
          this.ensureDirectories()
          this.writeHTTPConfig()
          logger.info('[GsCore] 本地 GsCore 安装完成')
        } catch (error) {
          if (existsSync(getGSCoreCoreDir())) rmSync(getGSCoreCoreDir(), { recursive: true, force: true })
          throw error
        }
        return
      }
      if (getRuntimeMode() !== 'docker')
        throw new Error('当前为 external 模式，请自行部署 GsCore；Docker 托管请设置 runtime_mode: docker')
      await this.dockerInstalled()
      this.ensureDirectories()
      await run('docker', ['pull', getDockerImage()])
      const name = getContainerName()
      try {
        await run('docker', ['rm', '-f', name])
      } catch (error) {
        logger.debug(`[GsCore] 无旧容器可移除：${error instanceof Error ? error.message : String(error)}`)
      }
      await run('docker', [
        'run', '-d', '--name', name, '--restart', 'unless-stopped',
        '-p', `${getPort()}:8765`,
        '-v', `${getDataDir()}:/gsuid_core/data`,
        '-v', `${getPluginsDir()}:/gsuid_core/gsuid_core/plugins`,
        getDockerImage()
      ])
      logger.info(`[GsCore] Docker 容器已创建：${name}`)
    })
  }

  private async checkLocalInstallEnvironment(): Promise<void> {
    if (!/^(?:https?:\/\/|git@)/i.test(getGSCoreRepo())) throw new Error('GsCore 仓库必须是 HTTP(S) 或 git@ 地址')
    if (!(await this.commandAvailable('git'))) throw new Error('未找到 Git，请先安装 Git')
    await this.pythonCommand()
    const coreDir = getGSCoreCoreDir()
    if (existsSync(coreDir) && readdirSync(coreDir).length > 0) throw new Error(`GsCore 目录已有内容但未完成安装：${coreDir}；请清理后重试`)
    const available = statfsSync(getGSCoreDir()).bavail * statfsSync(getGSCoreDir()).bsize
    if (available < 512 * 1024 * 1024) throw new Error('磁盘可用空间不足 512MB，无法安装 GsCore')
  }

  async start(): Promise<void> {
    await this.withinTask('启动 GsCore', async () => {
      if (getRuntimeMode() === 'local') {
        await this.startLocalProcess()
        return
      }
      if (getRuntimeMode() === 'external') {
        throw new Error('external 模式不会启动外部 GsCore，请在 GsCore 所在环境中启动服务')
      }
      await this.dockerInstalled()
      await run('docker', ['start', getContainerName()])
      await this.waitForReady()
    })
  }

  async stop(): Promise<void> {
    await this.withinTask('停止 GsCore', async () => {
      if (getRuntimeMode() === 'local') {
        await this.stopLocalProcess()
        return
      }
      if (getRuntimeMode() !== 'docker') throw new Error('external 模式不会停止用户自行部署的 GsCore')
      await run('docker', ['stop', getContainerName()])
      this.reachable = false
    })
  }

  async restart(): Promise<void> {
    await this.withinTask('重启 GsCore', async () => {
      if (getRuntimeMode() === 'local') {
        await this.stopLocalProcess()
        await this.startLocalProcess()
        return
      }
      if (getRuntimeMode() !== 'docker') throw new Error('external 模式请在 GsCore 所在环境中重启服务')
      await run('docker', ['restart', getContainerName()])
      await this.waitForReady()
    })
  }

  async enableHTTP(): Promise<void> {
    await this.withinTask('启用 GsCore HTTP', async () => {
      if (getRuntimeMode() === 'external')
        throw new Error('external 模式请在 GsCore 的 data/config.json 中设置 ENABLE_HTTP=true 后重启服务')
      if (getRuntimeMode() === 'local' && !this.localInstalled()) throw new Error('GsCore 尚未安装，请先执行安装')
      this.ensureDirectories()
      this.writeHTTPConfig()
      if (getRuntimeMode() === 'local' && this.localProcess) {
        await this.stopLocalProcess()
        await this.startLocalProcess()
        logger.info('[GsCore] 已写入 ENABLE_HTTP=true，并已重启本地 GsCore')
      } else {
        logger.info('[GsCore] 已写入 ENABLE_HTTP=true；请重启 GsCore 使配置生效')
      }
    })
  }

  async installPlugin(repo: string): Promise<string> {
    return this.withinTask('安装 GsCore 插件', async () => {
      if (getRuntimeMode() === 'external') throw new Error('external 模式请在 GsCore 所在环境中安装插件')
      const source = repo.trim()
      if (!/^(?:https?:\/\/|git@)/i.test(source)) throw new Error('插件仓库必须是 HTTP(S) 或 git@ 地址')
      this.ensureDirectories()
      const cleanSource = source.replace(/[?#].*$/, '').replace(/\/$/, '').replace(/\.git$/i, '')
      const name = cleanSource.split(/[/:]/).pop()?.replace(/[^a-zA-Z0-9_.-]/g, '-')
      if (!name) throw new Error('无法识别插件目录名')
      const target = join(getPluginsDir(), name)
      if (existsSync(target)) throw new Error(`插件 ${name} 已存在`)
      await run('git', ['clone', '--depth', '1', '--single-branch', source, target])
      return name
    })
  }

  async updatePlugin(name: string): Promise<void> {
    await this.withinTask('更新 GsCore 插件', async () => {
      if (getRuntimeMode() === 'external') throw new Error('external 模式请在 GsCore 所在环境中更新插件')
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('插件目录名无效')
      const target = join(getPluginsDir(), name)
      if (!existsSync(join(target, '.git'))) throw new Error('该插件不是 Git 仓库，无法更新')
      await run('git', ['-C', target, 'pull', '--ff-only'])
    })
  }

  async removePlugin(name: string): Promise<void> {
    await this.withinTask('删除 GsCore 插件', async () => {
      if (getRuntimeMode() === 'external') throw new Error('external 模式请在 GsCore 所在环境中删除插件')
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('插件目录名无效')
      const target = join(getPluginsDir(), name)
      if (!existsSync(target)) throw new Error('插件不存在')
      rmSync(target, { recursive: true, force: true })
    })
  }

  async send(message: MessageReceive): Promise<MessageSend | null> {
    let response: Response
    try {
      const bridgeToken = getWSToken() || String(this.getConfig().WS_TOKEN ?? '')
      response = await request('/api/send_msg', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(bridgeToken ? { 'x-ws-token': bridgeToken } : {}) },
        body: JSON.stringify(message)
      })
    } catch (error) {
      this.reachable = false
      throw error
    }
    if (!response.ok) {
      this.reachable = false
      throw new Error(`GsCore HTTP 请求失败：${response.status}`)
    }
    let result: { status_code?: number; data?: MessageSend | null }
    try {
      result = await response.json() as { status_code?: number; data?: MessageSend | null }
    } catch (error) {
      this.reachable = false
      throw new Error(`GsCore 返回了无效 JSON：${error instanceof Error ? error.message : String(error)}`)
    }
    if (result.status_code === -100) {
      this.reachable = true
      return null
    }
    if (result.status_code !== 200) {
      this.reachable = false
      throw new Error('GsCore 未处理消息；请确认 ENABLE_HTTP 已开启')
    }
    this.reachable = true
    return result.data ?? null
  }

  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + (getRuntimeMode() === 'local' ? getStartupTimeout() : 60_000)
    while (Date.now() < deadline) {
      if (getRuntimeMode() === 'local' && (!this.localProcess || this.localProcess.killed)) throw new Error(`GsCore 进程提前退出，请查看日志${this.localLogFile ? `：${this.localLogFile}` : ''}`)
      if (await this.refresh(true)) {
        this.localRestartCount = 0
        return
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error(`GsCore 启动超时，请查看日志${this.localLogFile ? `：${this.localLogFile}` : ''}`)
  }
}

export const manager = new GSCoreManager()
