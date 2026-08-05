import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron';
import { config as loadDotenv } from 'dotenv';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readdirSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const here = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const allowedThemeId = /^[A-Za-z0-9_-]{1,80}$/;
const allowedThemeName = /^[^\u0000-\u001f]{1,80}$/;
const allowedSessionId = /^[0-9a-f-]{36}$/i;
const allowedColor = /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i;
const previewCache = new Map();
const runtimeFingerprintCache = new Map();
const featureKeyPattern = /^sj(?:[1-9]\d{4})$/i;
const permanentFeatureKey = 'sj520';
let mainWindow = null;
const apiAllowedRoots = new Set();
const apiEnvFileName = 'api-workbench.env';
const apiTokenFileName = 'api-workbench-token.enc';
function normalizeApiPath(value) {
    return path.resolve(value);
}
function realApiPathIfExists(value) {
    if (!existsSync(value))
        return null;
    try {
        return fs.realpathSync.native(value);
    }
    catch {
        return null;
    }
}
function isApiPathInside(child, parent) {
    const relative = path.relative(normalizeApiPath(parent), normalizeApiPath(child));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function apiAllowedRootsFile() {
    return path.join(app.getPath('userData'), 'api-workbench-allowed-roots.json');
}
function loadApiAllowedRoots() {
    try {
        const value = JSON.parse(readFileSync(apiAllowedRootsFile(), 'utf8'));
        if (Array.isArray(value)) {
            value.filter((item) => typeof item === 'string' && existsSync(item)).forEach((item) => apiAllowedRoots.add(normalizeApiPath(item)));
        }
    }
    catch {
        // 忽略损坏的授权记录，用户可重新选择导出目录。
    }
}
function saveApiAllowedRoots() {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(apiAllowedRootsFile(), `${JSON.stringify([...apiAllowedRoots], null, 2)}\n`, 'utf8');
}
function isApiPathAllowed(value) {
    if (typeof value !== 'string' || !value.trim())
        return false;
    const candidate = normalizeApiPath(value);
    return [...apiAllowedRoots].some((root) => {
        if (!isApiPathInside(candidate, root))
            return false;
        const realCandidate = realApiPathIfExists(candidate);
        return !realCandidate || isApiPathInside(realCandidate, root);
    });
}
function validateApiWritePath(value) {
    if (typeof value !== 'string' || !isApiPathAllowed(value))
        throw new Error('导出路径未授权');
    const candidate = normalizeApiPath(value);
    const parent = path.dirname(candidate);
    const realParent = realApiPathIfExists(parent);
    if (!realParent || !isApiPathAllowed(realParent))
        throw new Error('导出目录无效或包含未授权的链接');
    if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink())
        throw new Error('不支持写入符号链接文件');
    return candidate;
}
function apiEnvFile() {
    return app.isPackaged ? path.join(app.getPath('userData'), apiEnvFileName) : apiEnvSourceFile();
}
function apiEnvExampleFile() {
    const candidates = [
        path.join(here, '..', '.env.example'),
        path.join(app.getAppPath(), '.env.example'),
    ];
    return candidates.find((file) => existsSync(file)) ?? candidates[0];
}
function apiEnvSourceFile() {
    const candidates = [
        path.join(here, '..', '.env'),
        path.join(app.getAppPath(), '.env'),
    ];
    return candidates.find((file) => existsSync(file)) ?? candidates[0];
}
function parseApiEnv(text) {
    const rows = [];
    let description = '';
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            description = '';
            continue;
        }
        if (line.startsWith('#')) {
            description = line.replace(/^#+\s*/, '');
            continue;
        }
        const separator = line.indexOf('=');
        if (separator <= 0) {
            description = '';
            continue;
        }
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            value = value.slice(1, -1);
        if (/^OPENAPI_[A-Z0-9_]+$/.test(key))
            rows.push({ key, value, description });
        description = '';
    }
    return rows;
}
function readApiEnvFile(file) {
    if (!existsSync(file))
        return [];
    try {
        return parseApiEnv(readFileSync(file, 'utf8'));
    }
    catch {
        return [];
    }
}
function readApiEnv() {
    const primaryFile = apiEnvFile();
    const primaryRows = readApiEnvFile(primaryFile);
    const sourceFile = apiEnvSourceFile();
    if (app.isPackaged && primaryFile !== sourceFile) {
        const merged = new Map(readApiEnvFile(sourceFile).map((row) => [row.key, row]));
        for (const row of primaryRows) {
            const fallback = merged.get(row.key);
            merged.set(row.key, !row.value.trim() && fallback?.value.trim()
                ? { ...row, value: fallback.value, description: row.description || fallback.description }
                : row);
        }
        return [...merged.values()];
    }
    return primaryRows.length > 0 ? primaryRows : readApiEnvFile(sourceFile);
}
function readApiEnvDefaults() {
    if (!existsSync(apiEnvExampleFile()))
        return [];
    try {
        return parseApiEnv(readFileSync(apiEnvExampleFile(), 'utf8'));
    }
    catch {
        return [];
    }
}
function loadApiEnv() {
    for (const row of readApiEnv())
        process.env[row.key] = row.value;
}
function formatApiEnv(rows) {
    return `${rows.flatMap((row) => [
        ...(row.description?.trim() ? [`# ${row.description.trim()}`] : []),
        `${row.key}=${/[\s"\\#]/.test(row.value) ? `"${row.value.replace(/"/g, '\\\"')}"` : row.value}`,
    ]).join('\n')}\n`;
}
function loadDevelopmentConfig() {
    if (!app.isPackaged)
        loadDotenv({ path: apiEnvSourceFile(), override: false });
}
function apiTokenFile() {
    return path.join(app.getPath('userData'), apiTokenFileName);
}
function stateRoot() {
    return isWindows
        ? path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local'), 'CodexDreamSkin')
        : path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'CodexDreamSkinStudio');
}
function featureAccessPath() { return path.join(app.getPath('userData'), 'feature-access.json'); }
function featureAccessState() {
    try {
        return JSON.parse(readFileSync(featureAccessPath(), 'utf8'));
    }
    catch {
        return {};
    }
}
function featureUnlocked() {
    return featureAccessState().unlocked === true;
}
function featurePermanent() {
    const value = featureAccessState();
    return value.unlocked === true && value.permanent === true;
}
function validFeatureKey(value) {
    if (typeof value !== 'string')
        return false;
    const key = value.trim().toLowerCase();
    return key === permanentFeatureKey || featureKeyPattern.test(key);
}
function unlockFeatures(permanent) {
    atomicWrite(featureAccessPath(), `${JSON.stringify({ unlocked: true, permanent })}\n`);
}
function lockFeatures() {
    atomicWrite(featureAccessPath(), `${JSON.stringify({ unlocked: false, permanent: false })}\n`);
}
function resourceRoot() { return app.isPackaged ? path.join(process.resourcesPath, 'platform') : path.resolve(here, '..', '..'); }
function platformRoot() { return path.join(resourceRoot(), isWindows ? 'windows' : 'macos'); }
function bridgePath() { return app.isPackaged ? path.join(resourceRoot(), 'bridge', isWindows ? 'windows-bridge.ps1' : 'macos-bridge.sh') : path.join(here, 'platform', isWindows ? 'windows-bridge.ps1' : 'macos-bridge.sh'); }
function scriptsRoot() {
    if (!app.isPackaged)
        return path.join(platformRoot(), 'scripts');
    const installed = isWindows ? path.join(stateRoot(), 'engine', 'scripts') : path.join(process.env.HOME ?? '', '.codex', 'codex-dream-skin-studio', 'scripts');
    return existsSync(path.join(installed, isWindows ? 'common-windows.ps1' : 'common-macos.sh')) ? installed : path.join(platformRoot(), 'scripts');
}
function installedRuntimeScript() {
    return isWindows
        ? path.join(stateRoot(), 'engine', 'scripts', 'common-windows.ps1')
        : path.join(process.env.HOME ?? '', '.codex', 'codex-dream-skin-studio', 'scripts', 'common-macos.sh');
}
function isRuntimeInstalled() { return existsSync(installedRuntimeScript()); }
function installedPlatformRoot() {
    return isWindows
        ? path.join(stateRoot(), 'engine')
        : path.join(process.env.HOME ?? '', '.codex', 'codex-dream-skin-studio');
}
function runtimeAssetRoot() {
    const installed = path.join(installedPlatformRoot(), 'assets');
    return existsSync(path.join(installed, 'dream-skin.css')) ? installed : path.join(platformRoot(), 'assets');
}
function runtimeFingerprint(root) {
    const cached = runtimeFingerprintCache.get(root);
    if (cached)
        return cached;
    const hash = createHash('sha256');
    let fileCount = 0;
    const includedExtensions = new Set(['.bat', '.css', '.json', '.js', '.mjs', '.ps1', '.sh']);
    const visit = (directory, relativeDirectory) => {
        let entries;
        try {
            entries = readdirSync(directory, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (entry.isSymbolicLink())
                continue;
            const fullPath = path.join(directory, entry.name);
            const relativePath = path.join(relativeDirectory, entry.name);
            if (entry.isDirectory())
                visit(fullPath, relativePath);
            else if (entry.isFile() && includedExtensions.has(path.extname(entry.name).toLowerCase())) {
                hash.update(`${relativePath}\0`);
                hash.update(readFileSync(fullPath));
                fileCount += 1;
            }
        }
    };
    for (const directoryName of ['assets', 'scripts', 'presets']) {
        const directory = path.join(root, directoryName);
        if (existsSync(directory))
            visit(directory, directoryName);
    }
    if (!fileCount)
        return null;
    const fingerprint = `${fileCount}:${hash.digest('hex')}`;
    runtimeFingerprintCache.set(root, fingerprint);
    return fingerprint;
}
function runtimeUpdateKind() {
    if (!isRuntimeInstalled())
        return null;
    if (!app.isPackaged) {
        const state = readManagedState();
        if (!state)
            return null;
        const sourceInjector = path.resolve(platformRoot(), 'scripts', 'injector.mjs');
        const activeInjector = typeof state.injectorPath === 'string' ? path.resolve(state.injectorPath) : '';
        if (activeInjector && activeInjector.toLowerCase() !== sourceInjector.toLowerCase())
            return 'development';
        const startedAt = Date.parse(typeof state.injectorStartedAt === 'string' ? state.injectorStartedAt : '');
        if (!Number.isFinite(startedAt))
            return null;
        for (const relativePath of ['assets/dream-skin.css', 'assets/renderer-inject.js', 'scripts/injector.mjs']) {
            try {
                if (statSync(path.join(platformRoot(), relativePath)).mtimeMs > startedAt)
                    return 'development';
            }
            catch { }
        }
        return null;
    }
    const bundled = runtimeFingerprint(platformRoot());
    const installed = runtimeFingerprint(installedPlatformRoot());
    return bundled && installed && bundled !== installed ? 'package' : null;
}
function installerPath() {
    return path.join(platformRoot(), 'scripts', isWindows ? 'install-dream-skin.ps1' : 'install-dream-skin-macos.sh');
}
async function installRuntime() {
    const script = installerPath();
    if (!existsSync(script))
        throw new Error(`找不到 Dream Skin 安装脚本：${script}`);
    if (isWindows) {
        await execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', script, '-NoShortcuts']);
    }
    else {
        await execute('/bin/bash', [script, '--no-launchers', '--no-launch']);
    }
    runtimeFingerprintCache.delete(installedPlatformRoot());
}
function readManagedState() {
    const file = path.join(stateRoot(), 'state.json');
    if (!existsSync(file))
        return null;
    try {
        const value = JSON.parse(readFileSync(file, 'utf8'));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
function connectionFromState(raw) {
    const port = Number(raw.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
        return null;
    const browserId = typeof raw.browserId === 'string' ? raw.browserId : '';
    return {
        id: browserId || `${process.platform}-${port}`,
        endpoint: `127.0.0.1:${port}`,
        ...(browserId ? { browserId } : {}),
        ...(Number.isInteger(Number(raw.injectorPid)) ? { injectorPid: Number(raw.injectorPid) } : {}),
        startedAt: typeof raw.injectorStartedAt === 'string' ? raw.injectorStartedAt : null,
        connectedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : typeof raw.verifiedAt === 'string' ? raw.verifiedAt : null,
    };
}
function readDreamArtVariables() {
    try {
        const css = readFileSync(path.join(runtimeAssetRoot(), 'dream-skin.css'), 'utf8');
        const read = (name, fallback) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)?.[1]?.trim() || fallback;
        const readColor = (name, fallback, seen = new Set()) => {
            if (seen.has(name))
                return fallback;
            const value = read(name, fallback);
            const reference = /^var\((--[A-Za-z0-9_-]+)\)$/i.exec(value);
            if (!reference)
                return value;
            return readColor(reference[1], fallback, new Set([...seen, name]));
        };
        const legacyCaretColor = readColor('--dream-caret-color', readColor('--dream-send-bg', isMac ? '#8298A3' : '#C84F70'));
        return {
            maskOpacityLight: Number(read('--dream-mask-opacity-light', '.70')),
            maskOpacityDark: Number(read('--dream-mask-opacity-dark', '.50')),
            caretColorLight: readColor('--dream-caret-color-light', isMac ? '#54707E' : legacyCaretColor),
            caretColorDark: readColor('--dream-caret-color-dark', isMac ? '#8298A3' : legacyCaretColor),
        };
    }
    catch {
        return {
            maskOpacityLight: .70,
            maskOpacityDark: .50,
            caretColorLight: isMac ? '#54707E' : '#C84F70',
            caretColorDark: isMac ? '#8298A3' : '#6C7EEB',
        };
    }
}
function normalizeThemePatch(value) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error('主题参数不是有效 JSON。');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('主题参数格式无效。');
    const art = parsed.art;
    if (!art || typeof art !== 'object' || Array.isArray(art))
        throw new Error('主题外观参数缺失。');
    const source = art;
    const target = {};
    const legacyOpacity = source.maskOpacity;
    for (const [key, value] of [['maskOpacityLight', source.maskOpacityLight ?? legacyOpacity], ['maskOpacityDark', source.maskOpacityDark ?? legacyOpacity]]) {
        if (value === undefined)
            continue;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > 1)
            throw new Error('遮罩透明度必须在 0 到 1 之间。');
        target[key] = number;
    }
    for (const key of ['caretColorLight', 'caretColorDark']) {
        const value = source[key] ?? source.caretColor;
        if (value === undefined)
            continue;
        if (typeof value !== 'string' || !allowedColor.test(value.trim()))
            throw new Error('光标颜色格式无效。');
        target[key] = value.trim();
    }
    for (const key of ['accent', 'accentInk']) {
        if (!(key in source))
            continue;
        const value = source[key];
        if (value === null) {
            target[key] = null;
            continue;
        }
        if (typeof value !== 'string' || !allowedColor.test(value.trim()))
            throw new Error('主题颜色格式无效。');
        target[key] = value.trim();
    }
    if ('imageLuma' in source) {
        const value = source.imageLuma;
        if (value === null)
            target.imageLuma = null;
        else {
            const number = Number(value);
            if (!Number.isFinite(number) || number < 0 || number > 1)
                throw new Error('图片亮度必须在 0 到 1 之间。');
            target.imageLuma = number;
        }
    }
    if (!Object.keys(target).length)
        throw new Error('没有可更新的主题参数。');
    return JSON.stringify({ art: target });
}
function validateImagePath(value) {
    const full = path.resolve(value);
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(full).toLowerCase()) || !existsSync(full))
        throw new Error('请选择 PNG、JPG、JPEG 或 WebP 图片。');
    const stats = statSync(full);
    if (!stats.isFile() || stats.size < 1 || stats.size > 16 * 1024 * 1024)
        throw new Error('图片必须是有效文件且不超过 16 MB。');
    return full;
}
function imageDataUrl(imagePath) {
    const full = validateImagePath(imagePath);
    const extension = path.extname(full).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${readFileSync(full).toString('base64')}`;
}
function execute(file, args) {
    if (isWindows) {
        return executeWindowsProcess(file, args);
    }
    return new Promise((resolve, reject) => execFile(file, args, {
        windowsHide: true,
        maxBuffer: 12 * 1024 * 1024,
        timeout: 120_000,
    }, (error, stdout, stderr) => {
        if (error) {
            const message = error.killed
                ? '平台操作超过 120 秒，已停止等待。请检查 Codex 和 Dream Skin 状态后重试。'
                : (stderr || stdout || error.message).trim() || '操作失败。';
            reject(new Error(message));
            return;
        }
        resolve({ stdout, stderr });
    }));
}
// Windows 子进程可能把 stdout 句柄传给后代进程，使用临时文件只等待宿主进程退出。
function executeWindowsProcess(file, args) {
    return new Promise((resolve, reject) => {
        const temporary = mkdtempSync(path.join(tmpdir(), 'codex-dream-skin-'));
        const stdoutPath = path.join(temporary, 'stdout.log');
        const stderrPath = path.join(temporary, 'stderr.log');
        const stdout = openSync(stdoutPath, 'w');
        const stderr = openSync(stderrPath, 'w');
        const child = spawn(file, args, { windowsHide: true, stdio: ['ignore', stdout, stderr] });
        let settled = false;
        let timer;
        const finish = (error, code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            closeSync(stdout);
            closeSync(stderr);
            let output = '';
            let errors = '';
            try {
                output = readFileSync(stdoutPath, 'utf8');
                errors = readFileSync(stderrPath, 'utf8');
            }
            finally {
                rmSync(temporary, { recursive: true, force: true });
            }
            if (error || code !== 0) {
                const message = error?.message || (errors || output || `进程退出码：${code ?? '未知'}`).trim() || '操作失败。';
                reject(new Error(message));
                return;
            }
            resolve({ stdout: output, stderr: errors });
        };
        timer = setTimeout(() => {
            child.kill();
            finish(new Error('平台操作超过 120 秒，已停止等待。请检查 Codex 和 Dream Skin 状态后重试。'));
        }, 120_000);
        child.once('error', (error) => finish(error));
        child.once('close', (code) => finish(undefined, code));
    });
}
function parseJsonOutput(stdout) {
    const line = stdout.trim().split(/\r?\n/).reverse().find((item) => item.trim().startsWith('{'));
    if (!line)
        throw new Error('平台脚本没有返回有效状态。');
    try {
        return JSON.parse(line);
    }
    catch {
        throw new Error('平台脚本返回了无效 JSON。');
    }
}
async function runBridge(action, values = []) {
    const script = bridgePath();
    if (!existsSync(script))
        throw new Error(`找不到平台 bridge：${script}`);
    if (isWindows) {
        const args = ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', script, '-Action', action, '-ScriptsRoot', scriptsRoot()];
        if (action === 'set-image' && values[0])
            args.push('-ImagePath', values[0]);
        else if (action === 'update-theme' && values[0])
            args.push('-ThemeJson', values[0]);
        else {
            if (values[0])
                args.push('-ThemeId', values[0]);
            if (values[1])
                args.push('-ThemeName', values[1]);
        }
        return parseJsonOutput((await execute('powershell.exe', args)).stdout);
    }
    const result = await execute('/bin/bash', [script, action, ...values]);
    return action === 'status' ? parseJsonOutput(result.stdout) : { ok: true, action, message: result.stdout.trim() };
}
function imagePreview(imagePath) {
    if (typeof imagePath !== 'string' || !imagePath)
        return null;
    const root = path.resolve(stateRoot());
    const full = path.resolve(imagePath);
    if (!(full === root || full.startsWith(`${root}${path.sep}`)) || !existsSync(full))
        return null;
    const extension = path.extname(full).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension))
        return null;
    try {
        const stats = statSync(full);
        if (stats.size < 1 || stats.size > 16 * 1024 * 1024)
            return null;
        const stamp = `${stats.size}:${stats.mtimeMs}`;
        const cached = previewCache.get(full);
        if (cached?.stamp === stamp)
            return cached.value;
        const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
        const value = `data:${mime};base64,${readFileSync(full).toString('base64')}`;
        previewCache.set(full, { stamp, value });
        return value;
    }
    catch {
        return null;
    }
}
function enrichTheme(record) {
    if (!record || typeof record !== 'object')
        return null;
    const value = record;
    return { id: String(value.id ?? ''), name: String(value.name ?? value.id ?? '未命名主题'), imagePath: value.imagePath, theme: value.theme, preview: imagePreview(value.imagePath) };
}
function enrichWindowsSnapshot(raw) {
    const managedState = readManagedState();
    const active = enrichTheme(raw.active);
    const themes = Array.isArray(raw.themes) ? raw.themes.map(enrichTheme).filter(Boolean) : [];
    const connection = managedState && (raw.session === 'active' || raw.session === 'paused')
        ? connectionFromState(managedState)
        : null;
    return {
        ...raw,
        version: app.getVersion(),
        featureUnlocked: featureUnlocked(),
        featurePermanent: featurePermanent(),
        installation: 'installed',
        active,
        themes,
        connection,
        variables: readDreamArtVariables(),
        runtimeUpdateKind: runtimeUpdateKind(),
        codexSessions: readCodexSessions(),
    };
}
function directoryNames(directory) {
    try {
        return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name);
    }
    catch {
        return [];
    }
}
function localMacThemes() {
    const themesRoot = path.join(stateRoot(), 'themes');
    if (!existsSync(themesRoot))
        return [];
    const entries = [];
    for (const name of directoryNames(themesRoot)) {
        if (!allowedThemeId.test(name))
            continue;
        const directory = path.join(themesRoot, name);
        const file = path.join(directory, 'theme.json');
        if (!existsSync(file))
            continue;
        try {
            const theme = JSON.parse(readFileSync(file, 'utf8'));
            const image = typeof theme.image === 'string' ? theme.image : '';
            const imagePath = path.resolve(directory, image);
            if (image && imagePath.startsWith(`${path.resolve(directory)}${path.sep}`))
                entries.push({ id: String(theme.id ?? name), name: String(theme.name ?? name), theme, preview: imagePreview(imagePath) });
        }
        catch { /* ignore one malformed theme */ }
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name));
}
function codexHome() { return isWindows ? process.env.USERPROFILE ?? process.env.HOME ?? '' : process.env.HOME ?? ''; }
function codexSessionIndexPath() { return path.join(codexHome(), '.codex', 'session_index.jsonl'); }
function readSessionHeader(file) {
    let handle = null;
    try {
        handle = openSync(file, 'r');
        const buffer = Buffer.alloc(64 * 1024);
        const bytes = readSync(handle, buffer, 0, buffer.length, 0);
        const firstLine = buffer.toString('utf8', 0, bytes).split(/\r?\n/, 1)[0];
        const value = JSON.parse(firstLine);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
    finally {
        if (handle !== null)
            closeSync(handle);
    }
}
function readSessionProject(id) {
    const codexRoot = path.join(codexHome(), '.codex');
    const file = [path.join(codexRoot, 'sessions'), path.join(codexRoot, 'archived_sessions')]
        .flatMap((root) => findSessionFiles(root, id))[0];
    if (!file)
        return null;
    const header = readSessionHeader(file);
    const payload = header?.payload;
    const cwd = payload && typeof payload === 'object' && typeof payload.cwd === 'string'
        ? String(payload.cwd).trim()
        : '';
    if (!cwd)
        return null;
    const normalized = cwd.replace(/[\\/]+$/, '');
    return { name: path.basename(normalized) || normalized, path: normalized };
}
function readCodexSessions() {
    const index = codexSessionIndexPath();
    if (!existsSync(index))
        return [];
    const records = [];
    for (const line of readFileSync(index, 'utf8').split(/\r?\n/)) {
        if (!line.trim())
            continue;
        try {
            const value = JSON.parse(line);
            const id = typeof value.id === 'string' ? value.id : '';
            if (allowedSessionId.test(id)) {
                const project = readSessionProject(id);
                records.push({ id, title: typeof value.thread_name === 'string' && value.thread_name.trim() ? value.thread_name.trim() : '未命名会话', updatedAt: typeof value.updated_at === 'string' ? value.updated_at : null, project: project?.name ?? null, projectPath: project?.path ?? null });
            }
        }
        catch { /* ignore one malformed index line */ }
    }
    return records.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
}
function findSessionFiles(root, id) {
    if (!existsSync(root))
        return [];
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isSymbolicLink())
            continue;
        const full = path.join(root, entry.name);
        if (entry.isDirectory())
            files.push(...findSessionFiles(full, id));
        else if (entry.isFile() && entry.name.includes(id) && entry.name.endsWith('.jsonl'))
            files.push(full);
    }
    return files;
}
function atomicWrite(file, content) {
    const temporary = `${file}.${process.pid}.tmp`;
    try {
        writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        renameSync(temporary, file);
    }
    finally {
        if (existsSync(temporary))
            rmSync(temporary, { force: true });
    }
}
function deleteCodexSession(id) {
    if (!allowedSessionId.test(id))
        throw new Error('会话 ID 无效。');
    const index = codexSessionIndexPath();
    const kept = [];
    let found = false;
    for (const line of existsSync(index) ? readFileSync(index, 'utf8').split(/\r?\n/) : []) {
        if (!line.trim())
            continue;
        try {
            if (JSON.parse(line).id === id) {
                found = true;
                continue;
            }
        }
        catch { /* keep malformed lines */ }
        kept.push(line);
    }
    const codexRoot = path.join(codexHome(), '.codex');
    const files = [path.join(codexRoot, 'sessions'), path.join(codexRoot, 'archived_sessions')].flatMap((root) => findSessionFiles(root, id));
    if (!found && !files.length)
        throw new Error('找不到要删除的 Codex 会话。');
    for (const file of files)
        rmSync(file, { force: true });
    if (found)
        atomicWrite(index, `${kept.join('\n')}${kept.length ? '\n' : ''}`);
}
function savedThemeDirectory(id) {
    if (!allowedThemeId.test(id))
        throw new Error('主题 ID 无效。');
    const root = path.resolve(path.join(stateRoot(), 'themes'));
    const directory = path.resolve(root, id);
    const sameParent = isWindows ? path.dirname(directory).toLowerCase() === root.toLowerCase() : path.dirname(directory) === root;
    if (!sameParent || !existsSync(directory))
        throw new Error('找不到已保存的主题。');
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('主题目录无效。');
    return directory;
}
function assertThemeTreeSafe(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink())
            throw new Error('主题目录包含不受支持的符号链接。');
        if (entry.isDirectory())
            assertThemeTreeSafe(path.join(directory, entry.name));
    }
}
function renameSavedTheme(id, name) { const directory = savedThemeDirectory(id); assertThemeTreeSafe(directory); const file = path.join(directory, 'theme.json'); const theme = JSON.parse(readFileSync(file, 'utf8')); theme.name = name; atomicWrite(file, `${JSON.stringify(theme, null, 2)}\n`); }
function deleteSavedTheme(id) { const directory = savedThemeDirectory(id); assertThemeTreeSafe(directory); rmSync(directory, { recursive: true, force: false }); }
function installApplicationMenu() {
    const template = [
        {
            label: "文件",
            submenu: [
                { label: "关闭窗口", role: "close" },
                { type: "separator" },
                { label: "退出", role: "quit" },
            ],
        },
        {
            label: "编辑",
            submenu: [
                { label: "撤销", role: "undo" },
                { label: "重做", role: "redo" },
                { type: "separator" },
                { label: "剪切", role: "cut" },
                { label: "复制", role: "copy" },
                { label: "粘贴", role: "paste" },
                { label: "删除", role: "delete" },
                { type: "separator" },
                { label: "全选", role: "selectAll" },
            ],
        },
        {
            label: "视图",
            submenu: [
                { label: "重新加载", role: "reload" },
                { label: "强制重新加载", role: "forceReload" },
                { label: "开发者工具", role: "toggleDevTools" },
                { type: "separator" },
                { label: "重置缩放", role: "resetZoom" },
                { label: "放大", role: "zoomIn" },
                { label: "缩小", role: "zoomOut" },
                { type: "separator" },
                { label: "全屏", role: "togglefullscreen" },
            ],
        },
        {
            label: "窗口",
            submenu: [
                { label: "最小化", role: "minimize" },
                { label: "缩放", role: "zoom" },
                { label: "关闭", role: "close" },
            ],
        },
        ...(featureUnlocked() ? [{
                label: "功能",
                submenu: [
                    { label: "API Workbench", click: () => mainWindow?.webContents.send('feature-command', 'api') },
                    { label: "Skin", click: () => mainWindow?.webContents.send('feature-command', 'skin') },
                ],
            }] : []),
        {
            label: "帮助",
            submenu: [
                {
                    label: "关于 Codex Dream Skin",
                    click: () => {
                        void dialog.showMessageBox({
                            type: "info",
                            title: "关于 Codex Dream Skin",
                            message: "Codex Dream Skin",
                            detail: `版本 v${app.getVersion()}`,
                        });
                    },
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function snapshot() {
    const codexSessions = readCodexSessions();
    if (!isRuntimeInstalled()) {
        return {
            platform: isMac ? 'darwin' : 'windows',
            version: app.getVersion(),
            featureUnlocked: featureUnlocked(),
            featurePermanent: featurePermanent(),
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
            runtimeUpdateKind: null,
            codexSessions,
        };
    }
    const raw = await runBridge('status');
    if (isWindows) {
        return enrichWindowsSnapshot(raw);
    }
    const activePath = path.join(stateRoot(), 'theme', 'theme.json');
    let active = null;
    try {
        const theme = JSON.parse(readFileSync(activePath, 'utf8'));
        const image = typeof theme.image === 'string' ? path.resolve(path.dirname(activePath), theme.image) : '';
        active = { id: String(theme.id ?? 'active'), name: String(theme.name ?? '当前主题'), imagePath: image, theme, preview: imagePreview(image) };
    }
    catch { /* no active theme yet */ }
    return { ...raw, version: app.getVersion(), featureUnlocked: featureUnlocked(), featurePermanent: featurePermanent(), installation: 'installed', active, themes: localMacThemes(), connection: raw.connection ?? null, variables: readDreamArtVariables(), runtimeUpdateKind: runtimeUpdateKind(), codexSessions };
}
async function createWindow() {
    const icon = path.join(app.getAppPath(), 'assets', 'dream-skin.ico');
    const window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1200, minHeight: 760, backgroundColor: '#f5f7fa', title: `Codex Dream Skin v${app.getVersion()}`, ...(existsSync(icon) ? { icon } : {}), webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    mainWindow = window;
    window.on('closed', () => { if (mainWindow === window)
        mainWindow = null; });
    if (process.env.VITE_DEV_SERVER_URL)
        await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    else
        await window.loadFile(path.join(app.getAppPath(), 'dist-ui', 'index.html'));
    if (!app.isPackaged && process.env.ELECTRON_OPEN_DEVTOOLS === 'true')
        window.webContents.openDevTools({ mode: 'detach' });
}
app.whenReady().then(async () => {
    loadDevelopmentConfig();
    loadApiAllowedRoots();
    loadApiEnv();
    installApplicationMenu();
    ipcMain.handle('snapshot', snapshot);
    ipcMain.handle('activate-feature', async (_event, key) => {
        if (!validFeatureKey(key))
            throw new Error('功能密钥无效。格式为 sj 加 10000 到 99999，或使用永久密钥 sj520。');
        const normalizedKey = String(key).trim().toLowerCase();
        unlockFeatures(normalizedKey === permanentFeatureKey);
        installApplicationMenu();
        return { featureUnlocked: true, featurePermanent: normalizedKey === permanentFeatureKey };
    });
    ipcMain.handle('deactivate-feature', () => {
        lockFeatures();
        installApplicationMenu();
        return { featureUnlocked: false, featurePermanent: false };
    });
    ipcMain.handle('action', async (_event, action, values = []) => {
        const supported = ['install', 'use-theme', 'save-theme', 'set-image', 'update-theme', 'rename-theme', 'delete-theme', 'delete-codex-session', 'start', 'pause', 'resume', 'restore'];
        if (!supported.includes(action))
            throw new Error('不支持的操作。');
        if (action === 'install') {
            await installRuntime();
            return snapshot();
        }
        if (!isRuntimeInstalled() && action !== 'delete-codex-session')
            throw new Error('Dream Skin 运行时尚未安装，请先安装后再执行此操作。');
        if (action === 'use-theme' && (!values[0] || !allowedThemeId.test(values[0])))
            throw new Error('主题 ID 无效。');
        if (action === 'save-theme' && (!values[0] || !allowedThemeName.test(values[0])))
            throw new Error('主题名称无效。');
        if ((action === 'rename-theme' || action === 'delete-theme') && (!values[0] || !allowedThemeId.test(values[0])))
            throw new Error('主题 ID 无效。');
        if (action === 'rename-theme' && (!values[1] || !allowedThemeName.test(values[1])))
            throw new Error('主题名称无效。');
        if (action === 'delete-codex-session' && (!values[0] || !allowedSessionId.test(values[0])))
            throw new Error('会话 ID 无效。');
        if (action === 'set-image')
            values[0] = validateImagePath(values[0] ?? '');
        if (action === 'update-theme')
            values[0] = normalizeThemePatch(values[0] ?? '');
        if (action === 'rename-theme') {
            renameSavedTheme(values[0], values[1].trim());
            return snapshot();
        }
        if (action === 'delete-theme') {
            deleteSavedTheme(values[0]);
            return snapshot();
        }
        if (action === 'delete-codex-session') {
            deleteCodexSession(values[0]);
            return snapshot();
        }
        const result = await runBridge(action, values);
        const refreshActions = ['use-theme', 'save-theme', 'set-image', 'update-theme', 'start', 'pause', 'resume', 'restore'];
        if (!refreshActions.includes(action))
            return result;
        if (isWindows && result.snapshot && typeof result.snapshot === 'object' && !Array.isArray(result.snapshot)) {
            return enrichWindowsSnapshot(result.snapshot);
        }
        return snapshot();
    });
    ipcMain.handle('choose-image', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '主题图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle('preview-image', async (_event, value) => {
        if (typeof value !== 'string')
            throw new Error('Image path is invalid.');
        return imageDataUrl(value);
    });
    ipcMain.handle('open-state-folder', async () => { await shell.openPath(stateRoot()); return true; });
    ipcMain.handle('env:getOpenApi', () => Object.fromEntries(readApiEnv().map(({ key, value }) => [key, value])));
    ipcMain.handle('dialog:selectDirectory', async (_event, defaultPath) => {
        if (!mainWindow)
            return null;
        const result = await dialog.showOpenDialog(mainWindow, { title: '选择 API 导出目录', properties: ['openDirectory', 'createDirectory'], defaultPath });
        if (result.canceled || !result.filePaths[0])
            return null;
        const selectedRoot = realApiPathIfExists(result.filePaths[0]);
        if (!selectedRoot)
            return null;
        apiAllowedRoots.add(normalizeApiPath(selectedRoot));
        saveApiAllowedRoots();
        return result.filePaths[0];
    });
    ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
        if (!mainWindow)
            return null;
        const result = await dialog.showSaveDialog(mainWindow, { title: '保存 API 文件', ...options });
        return result.canceled ? null : result.filePath ?? null;
    });
    ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
        try {
            const safePath = typeof filePath === 'string' ? normalizeApiPath(filePath) : '';
            if (!isApiPathAllowed(safePath))
                return { success: false, error: '导出路径未授权' };
            fs.mkdirSync(path.dirname(safePath), { recursive: true });
            const validatedPath = validateApiWritePath(safePath);
            writeFileSync(validatedPath, content ?? '', 'utf8');
            return { success: true, path: validatedPath };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('fs:writeFiles', async (_event, items) => {
        if (!Array.isArray(items))
            return [];
        if (items.some((item) => !item?.path || typeof item.path !== 'string' || !isApiPathAllowed(item.path)))
            return items.map((item) => ({ path: item?.path ?? '', success: false, error: '导出路径未授权' }));
        return Promise.all(items.map(async (item) => {
            try {
                const safePath = normalizeApiPath(item.path);
                await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
                const validatedPath = validateApiWritePath(safePath);
                await fs.promises.writeFile(validatedPath, item.content ?? '', 'utf8');
                return { path: validatedPath, success: true };
            }
            catch (error) {
                return { path: item.path, success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }));
    });
    ipcMain.handle('env:load', () => {
        const items = readApiEnv();
        return { success: true, items: items.length > 0 ? items : readApiEnvDefaults(), path: apiEnvFile() };
    });
    ipcMain.handle('env:save', (_event, items) => {
        if (!Array.isArray(items) || items.some((item) => !/^OPENAPI_[A-Z0-9_]+$/.test(item?.key ?? '')))
            return { success: false, error: '环境变量名必须以 OPENAPI_ 开头' };
        try {
            const existing = new Map(readApiEnv().map((item) => [item.key, item.value]));
            const protectedKeys = new Set(['OPENAPI_PWD_ENC_KEY', 'OPENAPI_OAUTH_CLIENT_ID', 'OPENAPI_OAUTH_CLIENT_SECRET']);
            const normalizedItems = items.map((item) => ({
                ...item,
                value: protectedKeys.has(item.key) && !item.value.trim() && existing.get(item.key)
                    ? existing.get(item.key)
                    : item.value,
            }));
            fs.mkdirSync(app.getPath('userData'), { recursive: true });
            writeFileSync(apiEnvFile(), formatApiEnv(normalizedItems), 'utf8');
            for (const key of Object.keys(process.env))
                if (key.startsWith('OPENAPI_'))
                    delete process.env[key];
            loadApiEnv();
            return { success: true, items: readApiEnv(), path: apiEnvFile() };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('env:reset', () => {
        try {
            const items = readApiEnvDefaults();
            fs.mkdirSync(app.getPath('userData'), { recursive: true });
            writeFileSync(apiEnvFile(), formatApiEnv(items), 'utf8');
            for (const key of Object.keys(process.env))
                if (key.startsWith('OPENAPI_'))
                    delete process.env[key];
            for (const item of items)
                process.env[item.key] = item.value;
            return { success: true, items, path: apiEnvFile() };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('token:save', (_event, token) => {
        try {
            if (!token) {
                if (existsSync(apiTokenFile()))
                    fs.unlinkSync(apiTokenFile());
                return { success: true };
            }
            fs.mkdirSync(app.getPath('userData'), { recursive: true });
            if (!safeStorage.isEncryptionAvailable())
                return { success: false, encrypted: false, error: '当前系统无法提供安全存储，Token 未保存' };
            fs.writeFileSync(apiTokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
            return { success: true, encrypted: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('token:load', () => {
        try {
            if (!existsSync(apiTokenFile()))
                return '';
            if (!safeStorage.isEncryptionAvailable())
                return '';
            return safeStorage.decryptString(fs.readFileSync(apiTokenFile()));
        }
        catch {
            return '';
        }
    });
    ipcMain.handle('token:clear', () => {
        try {
            if (existsSync(apiTokenFile()))
                fs.unlinkSync(apiTokenFile());
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('shell:openPath', (_event, value) => isApiPathAllowed(value) ? shell.openPath(value) : '打开路径未授权');
    await createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0)
        void createWindow(); });
});
app.on('window-all-closed', () => { if (!isMac)
    app.quit(); });
