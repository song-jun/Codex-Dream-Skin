export type SessionState = 'active' | 'paused' | 'off' | 'stale' | 'unknown'

export type ThemeRecord = {
  id: string
  name: string
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
  caretColor: string
}

export type CodexSessionRecord = {
  id: string
  title: string
  updatedAt: string | null
}

export type Snapshot = {
  platform: 'windows' | 'darwin'
  session: SessionState
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
