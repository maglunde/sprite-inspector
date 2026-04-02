
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from '../App'

function uploadImage() {
  const input = screen.getByLabelText(/choose sprite or image/i)
  const file = new File(['fake-image'], 'sprite.png', { type: 'image/png' })

  fireEvent.change(input, {
    target: {
      files: [file],
    },
  })

  const image = screen.getByAltText(/uploaded sprite/i)
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 64 })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 48 })
  fireEvent.load(image)
}

describe('App', () => {
  it('renders the initial empty state', () => {
    render(<App />)

    expect(screen.getByText(/sprite inspector/i)).toBeInTheDocument()
    expect(screen.getByText(/no file uploaded/i)).toBeInTheDocument()
    expect(screen.getByText('0, 0, 32, 32')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy region as x, y, width, height arguments/i })).toBeDisabled()
  })

  it('updates metadata and frame output after image upload', async () => {
    render(<App />)

    uploadImage()

    expect(await screen.findByText('sprite.png')).toBeInTheDocument()
    expect(screen.getByText('64 × 48px')).toBeInTheDocument()
    expect(screen.getByText('0, 0, 32, 32')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy region as x, y, width, height arguments/i })).toBeEnabled()
  })

  it('copies frame arguments in paste-ready format', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    navigator.clipboard.writeText = writeText
    render(<App />)

    uploadImage()

    await user.click(screen.getByRole('button', { name: /copy region as x, y, width, height arguments/i }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('0, 0, 32, 32')
    })
    expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument()
  })

  it('loads an image from paste events and ignores plain text paste', async () => {
    render(<App />)

    fireEvent.paste(window, {
      clipboardData: {
        items: [{ type: 'text/plain' }],
      },
    })

    expect(screen.getByText(/no file uploaded/i)).toBeInTheDocument()

    const pastedFile = new File(['fake-image'], '', { type: 'image/png' })
    const getAsFile = vi.fn(() => pastedFile)

    fireEvent.paste(window, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile,
          },
        ],
      },
    })

    expect(await screen.findByText(/pasted image/i)).toBeInTheDocument()
    expect(getAsFile).toHaveBeenCalled()
  })

  it('fetches a random large image from the internet', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['fake-image'], { type: 'image/jpeg' })),
    })

    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /random 1024/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/picsum\.photos\/seed\/.+\/1024\/1920\?request=\d+$/),
        expect.objectContaining({
          cache: 'no-store',
          mode: 'cors',
        }),
      )
    })
    expect(await screen.findByText(/^Random image /i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /load another random image/i })).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('can fetch a new random image on repeated clicks', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['fake-image'], { type: 'image/jpeg' })),
    })

    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    const randomButton = screen.getByRole('button', { name: /random 1024/i })
    await user.click(randomButton)
    await user.click(screen.getByRole('button', { name: /load another random image/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const [firstUrl] = fetchMock.mock.calls[0]
    const [secondUrl] = fetchMock.mock.calls[1]

    expect(firstUrl).not.toEqual(secondUrl)

    vi.unstubAllGlobals()
  })
})
