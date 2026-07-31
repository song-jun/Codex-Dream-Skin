import type { Snapshot } from './types'

declare global {
  interface Window {
    dreamSkin: {
      snapshot: () => Promise<Snapshot>
      action: (name: string, values?: string[]) => Promise<Snapshot>
      chooseImage: () => Promise<string | null>
      previewImage: (imagePath: string) => Promise<string>
      openStateFolder: () => Promise<boolean>
    }
  }
}

export {}
