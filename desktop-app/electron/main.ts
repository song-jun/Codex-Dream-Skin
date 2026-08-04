import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readdirSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = path.dirname(fileURLToPath(import.meta.url))
const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const allowedThemeId = /^[A-Za-z0-9_-]{1,80}$/
const allowedThemeName = /^[^\u0000-\u001f]{1,80}$/
const allowedSessionId = /^[0-9a-f-]{36}$/i
const allowedColor = /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i
const previewCache = new Map<string, { stamp: string; value: string | null }>()

type BridgeResult = Record<string, unknown>
type ThemeRecord = { id: string; name: string; imagePath?: string; theme?: Record<string, unknown>; preview?: string | null }
type CodexSessionRecord = { id: string; title: string; updatedAt: string | null; project: string | null; projectPath?: string | null }

function stateRoot(): string {
  return isWindows
    ? path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local'), 'CodexDreamSkin')
    : path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'CodexDreamSkinStudio')
}

function resourceRoot(): string { return app.isPackaged ? path.join(process.resourcesPath, 'platform') : path.resolve(here, '..', '..') }
function platformRoot(): string { return path.join(resourceRoot(), isWindows ? 'windows' : 'macos') }
function bridgePath(): string { return app.isPackaged ? path.join(resourceRoot(), 'bridge', isWindows ? 'windows-bridge.ps1' : 'macos-bridge.sh') : path.join(here, 'platform', isWindows ? 'windows-bridge.ps1' : 'macos-bridge.sh') }

function scriptsRoot(): string {
  if (!app.isPackaged) return path.join(platformRoot(), 'scripts')
  const installed = isWindows ? path.join(stateRoot(), 'engine', 'scripts') : path.join(process.env.HOME ?? '', '.codex', 'codex-dream-skin-studio', 'scripts')
  return existsSync(path.join(installed, isWindows ? 'common-windows.ps1' : 'common-macos.sh')) ? installed : path.join(platformRoot(), 'scripts')
}

function installedRuntimeScript(): string {
  return isWindows
    ? path.join(stateRoot(), 'engine', 'scripts', 'common-windows.ps1')
    : path.join(process.env.HOME ?? '', '.codex', 'codex-dream-skin-studio', 'scripts', 'common-macos.sh')
}

function isRuntimeInstalled(): boolean { return existsSync(installedRuntimeScript()) }

function installerPath(): string {
  return path.join(platformRoot(), 'scripts', isWindows ? 'install-dream-skin.ps1' : 'install-dream-skin-macos.sh')
}

async function installRuntime(): Promise<void> {
  const script = installerPath()
  if (!existsSync(script)) throw new Error(`找不到 Dream Skin 安装脚本：${script}`)
  if (isWindows) {
    await execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', script, '-NoShortcuts'])
  } else {
    await execute('/bin/bash', [script, '--no-launchers', '--no-launch'])
  }
}

function readManagedState(): Record<string, unknown> | null {
  const file = path.join(stateRoot(), 'state.json')
  if (!existsSync(file)) return null
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

function connectionFromState(raw: Record<string, unknown>): Record<string, unknown> | null {
  const port = Number(raw.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null
  const browserId = typeof raw.browserId === 'string' ? raw.browserId : ''
  return {
    id: browserId || `${process.platform}-${port}`,
    endpoint: `127.0.0.1:${port}`,
    ...(browserId ? { browserId } : {}),
    ...(Number.isInteger(Number(raw.injectorPid)) ? { injectorPid: Number(raw.injectorPid) } : {}),
    startedAt: typeof raw.injectorStartedAt === 'string' ? raw.injectorStartedAt : null,
    connectedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : typeof raw.verifiedAt === 'string' ? raw.verifiedAt : null,
  }
}

function readDreamArtVariables(): Record<string, unknown> {
  try {
    const css = readFileSync(path.join(platformRoot(), 'assets', 'dream-skin.css'), 'utf8')
    const read = (name: string, fallback: string) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)?.[1]?.trim() || fallback
    const readColor = (name: string, fallback: string, seen = new Set<string>()): string => {
      if (seen.has(name)) return fallback
      const value = read(name, fallback)
      const reference = /^var\((--[A-Za-z0-9_-]+)\)$/i.exec(value)
      if (!reference) return value
      return readColor(reference[1], fallback, new Set([...seen, name]))
    }
    const legacyCaretColor = readColor('--dream-caret-color', readColor('--dream-send-bg', isMac ? '#8298A3' : '#C84F70'))
    return {
      maskOpacityLight: Number(read('--dream-mask-opacity-light', '.70')),
      maskOpacityDark: Number(read('--dream-mask-opacity-dark', '.50')),
      caretColorLight: readColor('--dream-caret-color-light', isMac ? '#54707E' : legacyCaretColor),
      caretColorDark: readColor('--dream-caret-color-dark', isMac ? '#8298A3' : legacyCaretColor),
    }
  } catch {
    return {
      maskOpacityLight: .70,
      maskOpacityDark: .50,
      caretColorLight: isMac ? '#54707E' : '#C84F70',
      caretColorDark: isMac ? '#8298A3' : '#6C7EEB',
    }
  }
}

function normalizeThemePatch(value: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('主题参数不是有效 JSON。') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('主题参数格式无效。')
  const art = (parsed as Record<string, unknown>).art
  if (!art || typeof art !== 'object' || Array.isArray(art)) throw new Error('主题外观参数缺失。')
  const source = art as Record<string, unknown>
  const target: Record<string, unknown> = {}
  const legacyOpacity = source.maskOpacity
  for (const [key, value] of [['maskOpacityLight', source.maskOpacityLight ?? legacyOpacity], ['maskOpacityDark', source.maskOpacityDark ?? legacyOpacity]] as const) {
    if (value === undefined) continue
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error('遮罩透明度必须在 0 到 1 之间。')
    target[key] = number
  }
  for (const key of ['caretColorLight', 'caretColorDark'] as const) {
    const value = source[key] ?? source.caretColor
    if (value === undefined) continue
    if (typeof value !== 'string' || !allowedColor.test(value.trim())) throw new Error('光标颜色格式无效。')
    target[key] = value.trim()
  }
  for (const key of ['accent', 'accentInk'] as const) {
    if (!(key in source)) continue
    const value = source[key]
    if (value === null) {
      target[key] = null
      continue
    }
    if (typeof value !== 'string' || !allowedColor.test(value.trim())) throw new Error('主题颜色格式无效。')
    target[key] = value.trim()
  }
  if ('imageLuma' in source) {
    const value = source.imageLuma
    if (value === null) target.imageLuma = null
    else {
      const number = Number(value)
      if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error('图片亮度必须在 0 到 1 之间。')
      target.imageLuma = number
    }
  }
  if (!Object.keys(target).length) throw new Error('没有可更新的主题参数。')
  return JSON.stringify({ art: target })
}

function validateImagePath(value: string): string {
  const full = path.resolve(value)
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(full).toLowerCase()) || !existsSync(full)) throw new Error('请选择 PNG、JPG、JPEG 或 WebP 图片。')
  const stats = statSync(full)
  if (!stats.isFile() || stats.size < 1 || stats.size > 16 * 1024 * 1024) throw new Error('图片必须是有效文件且不超过 16 MB。')
  return full
}

function imageDataUrl(imagePath: string): string {
  const full = validateImagePath(imagePath)
  const extension = path.extname(full).toLowerCase()
  const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(full).toString('base64')}`
}

function execute(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  if (isWindows) {
    return executeWindowsProcess(file, args)
  }
  return new Promise((resolve, reject) => execFile(file, args, {
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
    timeout: 120_000,
  }, (error, stdout, stderr) => {
    if (error) {
      const message = error.killed
        ? '平台操作超过 120 秒，已停止等待。请检查 Codex 和 Dream Skin 状态后重试。'
        : (stderr || stdout || error.message).trim() || '操作失败。'
      reject(new Error(message))
      return
    }
    resolve({ stdout, stderr })
  }))
}

// Windows 子进程可能把 stdout 句柄传给后代进程，使用临时文件只等待宿主进程退出。
function executeWindowsProcess(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'codex-dream-skin-'))
    const stdoutPath = path.join(temporary, 'stdout.log')
    const stderrPath = path.join(temporary, 'stderr.log')
    const stdout = openSync(stdoutPath, 'w')
    const stderr = openSync(stderrPath, 'w')
    const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', stdout, stderr] })
    let settled = false
    let timer: NodeJS.Timeout

    const finish = (error?: Error, code?: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      closeSync(stdout)
      closeSync(stderr)
      let output = ''
      let errors = ''
      try {
        output = readFileSync(stdoutPath, 'utf8')
        errors = readFileSync(stderrPath, 'utf8')
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
      if (error || code !== 0) {
        const message = error?.message || (errors || output || `进程退出码：${code ?? '未知'}`).trim() || '操作失败。'
        reject(new Error(message))
        return
      }
      resolve({ stdout: output, stderr: errors })
    }

    timer = setTimeout(() => {
      child.kill()
      finish(new Error('平台操作超过 120 秒，已停止等待。请检查 Codex 和 Dream Skin 状态后重试。'))
    }, 120_000)
    child.once('error', (error) => finish(error))
    child.once('close', (code) => finish(undefined, code))
  })
}

function parseJsonOutput(stdout: string): BridgeResult {
  const line = stdout.trim().split(/\r?\n/).reverse().find((item) => item.trim().startsWith('{'))
  if (!line) throw new Error('平台脚本没有返回有效状态。')
  try { return JSON.parse(line) as BridgeResult } catch { throw new Error('平台脚本返回了无效 JSON。') }
}

async function runBridge(action: string, values: string[] = []): Promise<BridgeResult> {
  const script = bridgePath()
  if (!existsSync(script)) throw new Error(`找不到平台 bridge：${script}`)
  if (isWindows) {
    const args = ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', script, '-Action', action, '-ScriptsRoot', scriptsRoot()]
    if (action === 'set-image' && values[0]) args.push('-ImagePath', values[0])
    else if (action === 'update-theme' && values[0]) args.push('-ThemeJson', values[0])
    else { if (values[0]) args.push('-ThemeId', values[0]); if (values[1]) args.push('-ThemeName', values[1]) }
    return parseJsonOutput((await execute('powershell.exe', args)).stdout)
  }
  const result = await execute('/bin/bash', [script, action, ...values])
  return action === 'status' ? parseJsonOutput(result.stdout) : { ok: true, action, message: result.stdout.trim() }
}

function imagePreview(imagePath: unknown): string | null {
  if (typeof imagePath !== 'string' || !imagePath) return null
  const root = path.resolve(stateRoot())
  const full = path.resolve(imagePath)
  if (!(full === root || full.startsWith(`${root}${path.sep}`)) || !existsSync(full)) return null
  const extension = path.extname(full).toLowerCase()
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return null
  try {
    const stats = statSync(full)
    if (stats.size < 1 || stats.size > 16 * 1024 * 1024) return null
    const stamp = `${stats.size}:${stats.mtimeMs}`
    const cached = previewCache.get(full)
    if (cached?.stamp === stamp) return cached.value
    const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
    const value = `data:${mime};base64,${readFileSync(full).toString('base64')}`
    previewCache.set(full, { stamp, value })
    return value
  } catch { return null }
}

function enrichTheme(record: unknown): ThemeRecord | null {
  if (!record || typeof record !== 'object') return null
  const value = record as ThemeRecord
  return { id: String(value.id ?? ''), name: String(value.name ?? value.id ?? '未命名主题'), imagePath: value.imagePath, theme: value.theme, preview: imagePreview(value.imagePath) }
}

function enrichWindowsSnapshot(raw: BridgeResult): BridgeResult {
  const managedState = readManagedState()
  const active = enrichTheme(raw.active)
  const themes = Array.isArray(raw.themes) ? raw.themes.map(enrichTheme).filter(Boolean) : []
  const connection = managedState && (raw.session === 'active' || raw.session === 'paused')
    ? connectionFromState(managedState)
    : null
  return {
    ...raw,
    version: app.getVersion(),
    installation: 'installed',
    active,
    themes,
    connection,
    variables: readDreamArtVariables(),
    codexSessions: readCodexSessions(),
  }
}

function directoryNames(directory: string): string[] {
  try { return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name) } catch { return [] }
}

function localMacThemes(): ThemeRecord[] {
  const themesRoot = path.join(stateRoot(), 'themes')
  if (!existsSync(themesRoot)) return []
  const entries: ThemeRecord[] = []
  for (const name of directoryNames(themesRoot)) {
    if (!allowedThemeId.test(name)) continue
    const directory = path.join(themesRoot, name)
    const file = path.join(directory, 'theme.json')
    if (!existsSync(file)) continue
    try {
      const theme = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      const image = typeof theme.image === 'string' ? theme.image : ''
      const imagePath = path.resolve(directory, image)
      if (image && imagePath.startsWith(`${path.resolve(directory)}${path.sep}`)) entries.push({ id: String(theme.id ?? name), name: String(theme.name ?? name), theme, preview: imagePreview(imagePath) })
    } catch { /* ignore one malformed theme */ }
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

function codexHome(): string { return isWindows ? process.env.USERPROFILE ?? process.env.HOME ?? '' : process.env.HOME ?? '' }
function codexSessionIndexPath(): string { return path.join(codexHome(), '.codex', 'session_index.jsonl') }

function readSessionHeader(file: string): Record<string, unknown> | null {
  let handle: number | null = null
  try {
    handle = openSync(file, 'r')
    const buffer = Buffer.alloc(64 * 1024)
    const bytes = readSync(handle, buffer, 0, buffer.length, 0)
    const firstLine = buffer.toString('utf8', 0, bytes).split(/\r?\n/, 1)[0]
    const value = JSON.parse(firstLine) as Record<string, unknown>
    return value && typeof value === 'object' ? value : null
  } catch { return null }
  finally { if (handle !== null) closeSync(handle) }
}

function readSessionProject(id: string): { name: string; path: string } | null {
  const codexRoot = path.join(codexHome(), '.codex')
  const file = [path.join(codexRoot, 'sessions'), path.join(codexRoot, 'archived_sessions')]
    .flatMap((root) => findSessionFiles(root, id))[0]
  if (!file) return null
  const header = readSessionHeader(file)
  const payload = header?.payload
  const cwd = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).cwd === 'string'
    ? String((payload as Record<string, unknown>).cwd).trim()
    : ''
  if (!cwd) return null
  const normalized = cwd.replace(/[\\/]+$/, '')
  return { name: path.basename(normalized) || normalized, path: normalized }
}

function readCodexSessions(): CodexSessionRecord[] {
  const index = codexSessionIndexPath()
  if (!existsSync(index)) return []
  const records: CodexSessionRecord[] = []
  for (const line of readFileSync(index, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line) as Record<string, unknown>
      const id = typeof value.id === 'string' ? value.id : ''
      if (allowedSessionId.test(id)) {
        const project = readSessionProject(id)
        records.push({ id, title: typeof value.thread_name === 'string' && value.thread_name.trim() ? value.thread_name.trim() : '未命名会话', updatedAt: typeof value.updated_at === 'string' ? value.updated_at : null, project: project?.name ?? null, projectPath: project?.path ?? null })
      }
    } catch { /* ignore one malformed index line */ }
  }
  return records.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
}

function findSessionFiles(root: string, id: string): string[] {
  if (!existsSync(root)) return []
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...findSessionFiles(full, id))
    else if (entry.isFile() && entry.name.includes(id) && entry.name.endsWith('.jsonl')) files.push(full)
  }
  return files
}

function atomicWrite(file: string, content: string): void {
  const temporary = `${file}.${process.pid}.tmp`
  try { writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); renameSync(temporary, file) } finally { if (existsSync(temporary)) rmSync(temporary, { force: true }) }
}

function deleteCodexSession(id: string): void {
  if (!allowedSessionId.test(id)) throw new Error('会话 ID 无效。')
  const index = codexSessionIndexPath()
  const kept: string[] = []
  let found = false
  for (const line of existsSync(index) ? readFileSync(index, 'utf8').split(/\r?\n/) : []) {
    if (!line.trim()) continue
    try { if ((JSON.parse(line) as Record<string, unknown>).id === id) { found = true; continue } } catch { /* keep malformed lines */ }
    kept.push(line)
  }
  const codexRoot = path.join(codexHome(), '.codex')
  const files = [path.join(codexRoot, 'sessions'), path.join(codexRoot, 'archived_sessions')].flatMap((root) => findSessionFiles(root, id))
  if (!found && !files.length) throw new Error('找不到要删除的 Codex 会话。')
  for (const file of files) rmSync(file, { force: true })
  if (found) atomicWrite(index, `${kept.join('\n')}${kept.length ? '\n' : ''}`)
}

function savedThemeDirectory(id: string): string {
  if (!allowedThemeId.test(id)) throw new Error('主题 ID 无效。')
  const root = path.resolve(path.join(stateRoot(), 'themes'))
  const directory = path.resolve(root, id)
  const sameParent = isWindows ? path.dirname(directory).toLowerCase() === root.toLowerCase() : path.dirname(directory) === root
  if (!sameParent || !existsSync(directory)) throw new Error('找不到已保存的主题。')
  const info = lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('主题目录无效。')
  return directory
}

function assertThemeTreeSafe(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('主题目录包含不受支持的符号链接。')
    if (entry.isDirectory()) assertThemeTreeSafe(path.join(directory, entry.name))
  }
}
function renameSavedTheme(id: string, name: string): void { const directory = savedThemeDirectory(id); assertThemeTreeSafe(directory); const file = path.join(directory, 'theme.json'); const theme = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; theme.name = name; atomicWrite(file, `${JSON.stringify(theme, null, 2)}\n`) }
function deleteSavedTheme(id: string): void { const directory = savedThemeDirectory(id); assertThemeTreeSafe(directory); rmSync(directory, { recursive: true, force: false }) }

async function snapshot(): Promise<BridgeResult> {
  const codexSessions = readCodexSessions()
  if (!isRuntimeInstalled()) {
    return {
      platform: isMac ? 'darwin' : 'windows',
      version: app.getVersion(),
      session: 'uninstalled',
      installation: 'missing',
      codexRunning: false,
      injectorAlive: false,
      port: isWindows ? 9335 : 9341,
      active: null,
      themes: [],
      stateUpdatedAt: null,
      connection: null,
      variables: readDreamArtVariables(),
      codexSessions,
    }
  }
  const raw = await runBridge('status')
  if (isWindows) {
    return enrichWindowsSnapshot(raw)
  }
  const activePath = path.join(stateRoot(), 'theme', 'theme.json')
  let active: ThemeRecord | null = null
  try {
    const theme = JSON.parse(readFileSync(activePath, 'utf8')) as Record<string, unknown>
    const image = typeof theme.image === 'string' ? path.resolve(path.dirname(activePath), theme.image) : ''
    active = { id: String(theme.id ?? 'active'), name: String(theme.name ?? '当前主题'), imagePath: image, theme, preview: imagePreview(image) }
  } catch { /* no active theme yet */ }
  return { ...raw, version: app.getVersion(), installation: 'installed', active, themes: localMacThemes(), connection: raw.connection ?? null, variables: readDreamArtVariables(), codexSessions }
}

async function createWindow(): Promise<void> {
  const icon = path.join(app.getAppPath(), 'assets', 'dream-skin.ico')
  const window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1200, minHeight: 760, backgroundColor: '#f5f7fa', title: `Codex Dream Skin v${app.getVersion()}`, ...(existsSync(icon) ? { icon } : {}), webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL)
  else await window.loadFile(path.join(app.getAppPath(), 'dist-ui', 'index.html'))
}

app.whenReady().then(async () => {
  ipcMain.handle('snapshot', snapshot)
  ipcMain.handle('action', async (_event, action: string, values: string[] = []) => {
    const supported = ['install', 'use-theme', 'save-theme', 'set-image', 'update-theme', 'rename-theme', 'delete-theme', 'delete-codex-session', 'start', 'pause', 'resume', 'restore']
    if (!supported.includes(action)) throw new Error('不支持的操作。')
    if (action === 'install') { await installRuntime(); return snapshot() }
    if (!isRuntimeInstalled() && action !== 'delete-codex-session') throw new Error('Dream Skin 运行时尚未安装，请先安装后再执行此操作。')
    if (action === 'use-theme' && (!values[0] || !allowedThemeId.test(values[0]))) throw new Error('主题 ID 无效。')
    if (action === 'save-theme' && (!values[0] || !allowedThemeName.test(values[0]))) throw new Error('主题名称无效。')
    if ((action === 'rename-theme' || action === 'delete-theme') && (!values[0] || !allowedThemeId.test(values[0]))) throw new Error('主题 ID 无效。')
    if (action === 'rename-theme' && (!values[1] || !allowedThemeName.test(values[1]))) throw new Error('主题名称无效。')
    if (action === 'delete-codex-session' && (!values[0] || !allowedSessionId.test(values[0]))) throw new Error('会话 ID 无效。')
    if (action === 'set-image') values[0] = validateImagePath(values[0] ?? '')
    if (action === 'update-theme') values[0] = normalizeThemePatch(values[0] ?? '')
    if (action === 'rename-theme') { renameSavedTheme(values[0], values[1].trim()); return snapshot() }
    if (action === 'delete-theme') { deleteSavedTheme(values[0]); return snapshot() }
    if (action === 'delete-codex-session') { deleteCodexSession(values[0]); return snapshot() }
    const result = await runBridge(action, values)
    const refreshActions = ['use-theme', 'save-theme', 'set-image', 'update-theme', 'start', 'pause', 'resume', 'restore']
    if (!refreshActions.includes(action)) return result
    if (isWindows && result.snapshot && typeof result.snapshot === 'object' && !Array.isArray(result.snapshot)) {
      return enrichWindowsSnapshot(result.snapshot as BridgeResult)
    }
    return snapshot()
  })
  ipcMain.handle('choose-image', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '主题图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('preview-image', async (_event, value: unknown) => {
    if (typeof value !== 'string') throw new Error('Image path is invalid.')
    return imageDataUrl(value)
  })
  ipcMain.handle('open-state-folder', async () => { await shell.openPath(stateRoot()); return true })
  await createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })
