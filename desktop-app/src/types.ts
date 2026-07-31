export type SessionState = 'active' | 'paused' | 'off' | 'stale' | 'unknown' | 'uninstalled'

export type InstallationState = 'installed' | 'missing'

export type ThemeRecord = {
  id: string
  name: string
  imagePath?: string
  preview?: string | null
  theme?: Record<string, unknown>
}

export type RendererConnection = {
  id: string
  endpoint: string
  browserId?: string
  injectorPid?: number
  startedAt?: string | null
  connectedAt?: string | null
}

export type DreamArtVariables = {
  maskOpacityLight: number
  maskOpacityDark: number
  caretColorLight: string
  caretColorDark: string
}

export type CodexSessionRecord = {
  id: string
  title: string
  updatedAt: string | null
  project: string | null
  projectPath?: string | null
}

export type Snapshot = {
  platform: 'windows' | 'darwin'
  session: SessionState
  installation: InstallationState
  codexRunning: boolean
  injectorAlive: boolean
  port: number
  active: ThemeRecord | null
  themes: ThemeRecord[]
  stateUpdatedAt?: string | null
  connection?: RendererConnection | null
  variables?: DreamArtVariables
  codexSessions: CodexSessionRecord[]
}
