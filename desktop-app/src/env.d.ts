import type { Snapshot } from './types'

declare global {
  interface Window {
    dreamSkin: {
      snapshot: () => Promise<Snapshot>
      action: (name: string, values?: string[]) => Promise<Snapshot>
      chooseImage: () => Promise<string | null>
      previewImage: (imagePath: string) => Promise<string>
      openStateFolder: () => Promise<boolean>
      activateFeature: (key: string) => Promise<{ featureUnlocked: boolean; featurePermanent: boolean }>
      deactivateFeature: () => Promise<{ featureUnlocked: boolean; featurePermanent: boolean }>
      onFeatureCommand: (listener: (category: 'api' | 'skin') => void) => () => void
    }
    electronAPI?: {
      getOpenApiEnv: () => Promise<Record<string, string>>
      selectDirectory: (defaultPath?: string) => Promise<string | null>
      saveFile: (options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; path?: string; error?: string }>
      writeFiles: (items: Array<{ path: string; content: string }>) => Promise<Array<{ path: string; success: boolean; error?: string }>>
      saveEnv: (items: Array<{ key: string; value: string; description?: string }>) => Promise<{ success: boolean; items?: Array<{ key: string; value: string; description: string }>; path?: string; error?: string }>
      loadEnv: () => Promise<{ success: boolean; items?: Array<{ key: string; value: string; description: string }>; path?: string; error?: string }>
      resetEnv: () => Promise<{ success: boolean; items?: Array<{ key: string; value: string; description: string }>; path?: string; error?: string }>
      saveToken: (token: string) => Promise<{ success: boolean; encrypted?: boolean; error?: string }>
      loadToken: () => Promise<string>
      clearToken: () => Promise<{ success: boolean; error?: string }>
      openPath: (value: string) => Promise<string>
    }
    __RUNTIME_ENV__?: Record<string, string>
  }
}

export {}
