import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const createContext = () => ({
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn((x, y, width, height) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  })),
  imageSmoothingEnabled: false,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: vi.fn(() => createContext()),
})

Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  writable: true,
  value: vi.fn(),
})

Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  writable: true,
  value: vi.fn(),
})

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  writable: true,
  value: vi.fn(() => true),
})

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-image')
} else {
  vi.spyOn(window.URL, 'createObjectURL').mockImplementation(() => 'blob:mock-image')
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn()
} else {
  vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {})
}

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})
