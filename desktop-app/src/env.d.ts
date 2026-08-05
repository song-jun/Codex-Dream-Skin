import type { Snapshot } from './types'

declare global {
  interface Window {
    dreamSkin: {
      snapshot: () => Promise<Snapshot>
      action: (name: string, values?: string[]) => Promise<Snapshot>
      chooseImage: () => Promise<string | null>
      previewImage: (imagePath: string) => Promise<string>
      openStateFolder: () => Promise<boolean>
      activateFeature: (key: string) => Promise<{ featureUnlocked: boolean }>
      deactivateFeature: () => Promise<{ featureUnlocked: boolean }>
      onFeatureCommand: (listener: (category: 'api' | 'skin') => void) => () => void
    }
  }
}

export {}
