export type ImagePalette = {
  accent: string
  accentInk: string
  luma: number
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function luminance(red: number, green: number, blue: number): number {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function rgbString(red: number, green: number, blue: number): string {
  return `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`
}

export function analyzeImagePalette(dataUrl: string): Promise<ImagePalette | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const width = 48
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas is unavailable')
        context.drawImage(image, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        let count = 0
        let redTotal = 0
        let greenTotal = 0
        let blueTotal = 0
        let lumaTotal = 0
        let accentWeight = 0
        let accentRed = 0
        let accentGreen = 0
        let accentBlue = 0

        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue
          const red = pixels[offset]
          const green = pixels[offset + 1]
          const blue = pixels[offset + 2]
          const light = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
          const max = Math.max(red, green, blue)
          const min = Math.min(red, green, blue)
          const saturation = max ? (max - min) / max : 0
          const usableLight = 1 - Math.min(1, Math.abs(light - 0.46) / 0.54)
          const weight = saturation ** 2 * (0.15 + usableLight)
          count += 1
          redTotal += red
          greenTotal += green
          blueTotal += blue
          lumaTotal += light
          accentWeight += weight
          accentRed += red * weight
          accentGreen += green * weight
          accentBlue += blue * weight
        }

        if (!count) throw new Error('Image contains no visible pixels')
        const averageRed = redTotal / count
        const averageGreen = greenTotal / count
        const averageBlue = blueTotal / count
        const red = accentWeight > 1 ? accentRed / accentWeight : averageRed
        const green = accentWeight > 1 ? accentGreen / accentWeight : averageGreen
        const blue = accentWeight > 1 ? accentBlue / accentWeight : averageBlue

        resolve({
          accent: rgbString(red, green, blue),
          accentInk: luminance(red, green, blue) > 0.42 ? '#1A181C' : '#FAF8FB',
          luma: clamp(lumaTotal / count),
        })
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}
