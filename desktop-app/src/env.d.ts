import type { Snapshot } from './types'

declare global {
  interface Window {
    dreamSkin: {
      snapshot: () => Promise<Snapshot>
      action: (name: string, values?: string[]) => Promise<Snapshot>
      chooseImage: () => Promise<string | null>
      openStateFolder: () => Promise<boolean>
      confirmRestore: () => Promise<boolean>
    }
  }
}

export {}
