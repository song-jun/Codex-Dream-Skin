import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
type CodexSessionRecord = { id: string; title: string; updatedAt: string | null }

function stateRoot(): string {
  return isWindows
    ? path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local'), 'CodexDreamSkin')
    : path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'CodexDreamSkinStudio')
}

function resourceRoot(): string { return app.isPackaged ? path.join(process.resourcesPath, 'platform') : path.resolve(here, '..', '..') }
function platformRoot(): string { return path.join(resourceRoot(), isWindows ? 'windows' : 'macos') }
function bridgePath(): string { return app.isPackaged ? path.join(resourceRoot(), 'bridge', isWindows ? 'windows-bridge.ps1' : 'macos-bridge.sh') : path.join(here, 'platform', isWindows ? 'windows-bridge.ps1' : 'macos-bridge.sh') }

function scriptsRoot(): string {
  const installed = isWindows ? path.join(stateRoot(), 'engine', 'scripts') : path.join(process.env.HOME ?? '', '.codex', 'codex-dream-skin-studio', 'scripts')
  return existsSync(path.join(installed, isWindows ? 'common-windows.ps1' : 'common-macos.sh')) ? installed : path.join(platformRoot(), 'scripts')
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
    return { maskOpacityLight: Number(read('--dream-mask-opacity-light', '.70')), maskOpacityDark: Number(read('--dream-mask-opacity-dark', '.50')), caretColor: read('--dream-caret-color', read('--dream-send-bg', '#C84F70')) }
  } catch { return { maskOpacityLight: .70, maskOpacityDark: .50, caretColor: '#C84F70' } }
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
  if (source.caretColor !== undefined) {
    if (typeof source.caretColor !== 'string' || !allowedColor.test(source.caretColor.trim())) throw new Error('光标颜色格式无效。')
    target.caretColor = source.caretColor.trim()
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

function execute(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, maxBuffer: 12 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) { reject(new Error((stderr || stdout || error.message).trim() || '操作失败。')); return }
    resolve({ stdout, stderr })
  }))
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
  return { id: String(value.id ?? ''), name: String(value.name ?? value.id ?? '未命名主题'), theme: value.theme, preview: imagePreview(value.imagePath) }
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

function readCodexSessions(): CodexSessionRecord[] {
  const index = codexSessionIndexPath()
  if (!existsSync(index)) return []
  const records: CodexSessionRecord[] = []
  for (const line of readFileSync(index, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line) as Record<string, unknown>
      const id = typeof value.id === 'string' ? value.id : ''
      if (allowedSessionId.test(id)) records.push({ id, title: typeof value.thread_name === 'string' && value.thread_name.trim() ? value.thread_name.trim() : '未命名会话', updatedAt: typeof value.updated_at === 'string' ? value.updated_at : null })
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
  const raw = await runBridge('status')
  const managedState = readManagedState()
  const connection = managedState && (raw.session === 'active' || raw.session === 'paused') ? connectionFromState(managedState) : null
  const codexSessions = readCodexSessions()
  if (isWindows) {
    const active = enrichTheme(raw.active)
    const themes = Array.isArray(raw.themes) ? raw.themes.map(enrichTheme).filter(Boolean) : []
    return { ...raw, active, themes, connection, variables: readDreamArtVariables(), codexSessions }
  }
  const activePath = path.join(stateRoot(), 'theme', 'theme.json')
  let active: ThemeRecord | null = null
  try {
    const theme = JSON.parse(readFileSync(activePath, 'utf8')) as Record<string, unknown>
    const image = typeof theme.image === 'string' ? path.resolve(path.dirname(activePath), theme.image) : ''
    active = { id: String(theme.id ?? 'active'), name: String(theme.name ?? '当前主题'), theme, preview: imagePreview(image) }
  } catch { /* no active theme yet */ }
  return { ...raw, active, themes: localMacThemes(), connection, variables: readDreamArtVariables(), codexSessions }
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1200, minHeight: 760, backgroundColor: '#f5f7fa', title: 'Codex Dream Skin', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL)
  else await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  ipcMain.handle('snapshot', snapshot)
  ipcMain.handle('action', async (_event, action: string, values: string[] = []) => {
    const supported = ['use-theme', 'save-theme', 'set-image', 'update-theme', 'rename-theme', 'delete-theme', 'delete-codex-session', 'start', 'pause', 'resume', 'restore']
    if (!supported.includes(action)) throw new Error('不支持的操作。')
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
    return refreshActions.includes(action) ? snapshot() : result
  })
  ipcMain.handle('choose-image', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '主题图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('open-state-folder', async () => { await shell.openPath(stateRoot()); return true })
  ipcMain.handle('confirm-restore', async () => {
    const result = await dialog.showMessageBox({ type: 'warning', buttons: ['恢复官方外观', '取消'], defaultId: 1, cancelId: 1, title: '恢复 Codex 外观', message: '这会关闭并重新打开官方 Codex，移除当前皮肤。', detail: '未保存的 Codex 输入可能丢失。' })
    return result.response === 0
  })
  await createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })
