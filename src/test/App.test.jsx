import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from '../App'

function uploadImage() {
  const input = screen.getByLabelText(/choose image/i)
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

function uploadNamedImage(name, width = 64, height = 48, content = 'fake-image') {
  const input = screen.getByLabelText(/choose image/i)
  const file = new File([content], name, { type: 'image/png' })

  fireEvent.change(input, {
    target: {
      files: [file],
    },
  })

  const image = screen.getByAltText(/uploaded sprite/i)
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height })
  fireEvent.load(image)
}

function uploadInvalidFile(name = 'notes.txt') {
  const input = screen.getByLabelText(/choose image/i)
  const file = new File(['not-an-image'], name, { type: 'text/plain' })

  fireEvent.change(input, {
    target: {
      files: [file],
    },
  })
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

    expect(await screen.findByText('sprite.png', { selector: 'strong' })).toBeInTheDocument()
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

    expect(await screen.findByText(/pasted image/i, { selector: 'strong' })).toBeInTheDocument()
    expect(getAsFile).toHaveBeenCalled()
  })

  it('sets the frame from pasted coordinates when an image is loaded', () => {
    render(<App />)

    uploadImage()

    fireEvent.paste(window, {
      clipboardData: {
        items: [{ type: 'text/plain' }],
        getData: vi.fn(() => '8, 6, 12, 10'),
      },
    })

    expect(screen.getByText('8, 6, 12, 10')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'x' })).toHaveValue(8)
    expect(screen.getByRole('spinbutton', { name: 'y' })).toHaveValue(6)
    expect(screen.getByRole('spinbutton', { name: 'width' })).toHaveValue(12)
    expect(screen.getByRole('spinbutton', { name: 'height' })).toHaveValue(10)
  })

  it('finds the first four comma-separated numbers inside pasted code', () => {
    render(<App />)

    uploadNamedImage('sprite.png', 512, 256)

    fireEvent.paste(window, {
      clipboardData: {
        items: [{ type: 'text/plain' }],
        getData: vi.fn(() => 'new Sprite(_mspacImg, 457, 17, 14, 14),'),
      },
    })

    expect(screen.getByText('457, 17, 14, 14')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'x' })).toHaveValue(457)
    expect(screen.getByRole('spinbutton', { name: 'y' })).toHaveValue(17)
    expect(screen.getByRole('spinbutton', { name: 'width' })).toHaveValue(14)
    expect(screen.getByRole('spinbutton', { name: 'height' })).toHaveValue(14)
  })

  it('ignores pasted coordinates that would exceed the image bounds', () => {
    render(<App />)

    uploadImage()

    fireEvent.paste(window, {
      clipboardData: {
        items: [{ type: 'text/plain' }],
        getData: vi.fn(() => '50, 40, 20, 10'),
      },
    })

    expect(screen.getByText('0, 0, 32, 32')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'x' })).toHaveValue(0)
    expect(screen.getByRole('spinbutton', { name: 'y' })).toHaveValue(0)
    expect(screen.getByRole('spinbutton', { name: 'width' })).toHaveValue(32)
    expect(screen.getByRole('spinbutton', { name: 'height' })).toHaveValue(32)
  })

  it('shows an error for invalid file uploads', () => {
    render(<App />)

    uploadInvalidFile()

    expect(screen.getByText('Choose a valid image file.')).toBeInTheDocument()
    expect(screen.getByText(/no file uploaded/i)).toBeInTheDocument()
  })

  it('shows recent files and lets you reopen one of the last uploads', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadNamedImage('first.png', 64, 48)
    uploadNamedImage('second.png', 96, 64)

    expect(screen.getByRole('button', { name: 'first.png' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'second.png' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'first.png' }))

    const image = screen.getByAltText(/uploaded sprite/i)
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 64 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 48 })
    fireEvent.load(image)

    expect(await screen.findByText('first.png', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('64 × 48px')).toBeInTheDocument()
  })

  it('keeps recent image order unchanged when reopening an existing item', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadNamedImage('first.png', 64, 48)
    uploadNamedImage('second.png', 96, 64)

    const recentBefore = screen.getAllByRole('button').filter((button) =>
      ['first.png', 'second.png'].includes(button.textContent),
    )
    expect(recentBefore.map((button) => button.textContent)).toEqual(['second.png', 'first.png'])

    await user.click(screen.getByRole('button', { name: 'first.png' }))

    const image = screen.getByAltText(/uploaded sprite/i)
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 64 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 48 })
    fireEvent.load(image)

    const recentAfter = screen.getAllByRole('button').filter((button) =>
      ['first.png', 'second.png'].includes(button.textContent),
    )
    expect(recentAfter.map((button) => button.textContent)).toEqual(['second.png', 'first.png'])
  })

  it('numbers recent files when multiple uploads have the same name', () => {
    render(<App />)

    uploadNamedImage('image.png', 64, 48, 'first-image')
    uploadNamedImage('image.png', 96, 64, 'second-image-with-different-size')

    expect(screen.getByRole('button', { name: 'image.png (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'image.png (2)' })).toBeInTheDocument()
  })

  it('stores up to 10 recent images', () => {
    render(<App />)

    for (let index = 1; index <= 12; index += 1) {
      uploadNamedImage(`image-${index}.png`, 64, 48, `content-${index}`)
    }

    expect(screen.queryByRole('button', { name: 'image-1.png' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'image-2.png' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'image-3.png' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'image-12.png' })).toBeInTheDocument()
  })

  it('removes a recent image when its remove control is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadNamedImage('first.png', 64, 48)
    uploadNamedImage('second.png', 96, 64)

    await user.click(screen.getByRole('button', { name: /remove first\.png from recent images/i }))

    expect(screen.queryByRole('button', { name: 'first.png' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'second.png' })).toBeInTheDocument()
  })

  it('moves the selection one pixel at a time with the frame arrow controls', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadImage()

    await user.click(screen.getByRole('button', { name: /move selection right one pixel/i }))
    await user.click(screen.getByRole('button', { name: /move selection down one pixel/i }))

    expect(screen.getByText('1, 1, 32, 32')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'x' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: 'y' })).toHaveValue(1)
  })

  it('moves the selection with arrow keys when the crop preview has focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadImage()

    screen.getByLabelText(/crop preview controls/i).focus()
    await user.keyboard('{ArrowRight}{ArrowDown}')

    expect(screen.getByText('1, 1, 32, 32')).toBeInTheDocument()
  })

  it('locks x and y together when the position lock is enabled', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadImage()

    await user.click(screen.getByRole('button', { name: /lock x and y values/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'x' }), {
      target: {
        value: '10',
        valueAsNumber: 10,
      },
    })

    expect(screen.getByRole('spinbutton', { name: 'x' })).toHaveValue(10)
    expect(screen.getByRole('spinbutton', { name: 'y' })).toHaveValue(10)
    expect(screen.getByText('10, 10, 32, 32')).toBeInTheDocument()
  })

  it('locks width and height together when the size lock is enabled', async () => {
    const user = userEvent.setup()
    render(<App />)

    uploadImage()

    await user.click(screen.getByRole('button', { name: /lock width and height values/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'width' }), {
      target: {
        value: '12',
        valueAsNumber: 12,
      },
    })

    expect(screen.getByRole('spinbutton', { name: 'width' })).toHaveValue(12)
    expect(screen.getByRole('spinbutton', { name: 'height' })).toHaveValue(12)
    expect(screen.getByText('0, 0, 12, 12')).toBeInTheDocument()
  })
})
