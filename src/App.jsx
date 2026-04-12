import React, { useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_SELECTION = {
  x: 0,
  y: 0,
  width: 32,
  height: 32,
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function isEditableTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}

function rgbaToHex(r, g, b, a) {
  const alpha = Math.round((a / 255) * 100)
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')} (${alpha}%)`
}

function parsePastedSelection(text) {
  if (typeof text !== 'string') {
    return null
  }

  const compactText = text.trim()

  if (!compactText) {
    return null
  }

  const coordinateSequence = compactText.match(/-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/)

  if (!coordinateSequence) {
    return null
  }

  const [x, y, width, height] = coordinateSequence[0].split(/\s*,\s*/).map(Number)

  return {
    x,
    y,
    width,
    height,
  }
}

function summarizePixels(imageData) {
  const { data, width, height } = imageData
  const histogram = new Map()
  let red = 0
  let green = 0
  let blue = 0
  let alpha = 0

  for (let index = 0; index < data.length; index += 4) {
    const key = `${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`
    histogram.set(key, (histogram.get(key) ?? 0) + 1)
    red += data[index]
    green += data[index + 1]
    blue += data[index + 2]
    alpha += data[index + 3]
  }

  const pixelCount = width * height || 1
  const average = {
    r: Math.round(red / pixelCount),
    g: Math.round(green / pixelCount),
    b: Math.round(blue / pixelCount),
    a: Math.round(alpha / pixelCount),
  }

  const dominantColors = [...histogram.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 8)
    .map(([key, count]) => {
      const [r, g, b, a] = key.split(',').map(Number)
      return {
        key,
        count,
        label: rgbaToHex(r, g, b, a),
        swatch: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
      }
    })

  return {
    average,
    dominantColors,
    uniqueColorCount: histogram.size,
    pixelCount,
  }
}

export default function App() {
  const previewFrameSize = 220
  const [selection, setSelection] = useState(DEFAULT_SELECTION)
  const [imageSource, setImageSource] = useState('')
  const [imageName, setImageName] = useState('No file uploaded')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [selectionData, setSelectionData] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const [previewDragMode, setPreviewDragMode] = useState('pan')
  const [isPositionLocked, setIsPositionLocked] = useState(false)
  const [isSizeLocked, setIsSizeLocked] = useState(false)
  const [recentFiles, setRecentFiles] = useState([])
  const imageRef = useRef(null)
  const imageScrollRef = useRef(null)
  const imageSurfaceRef = useRef(null)
  const selectionOverlayRef = useRef(null)
  const sourceCanvasRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const interactionRef = useRef(null)
  const previousZoomRef = useRef(zoom)
  const dragDepthRef = useRef(0)

  const boundedSelection = useMemo(() => {
    if (!imageSize.width || !imageSize.height) {
      return selection
    }

    const safeWidth = clamp(selection.width, 1, imageSize.width)
    const safeHeight = clamp(selection.height, 1, imageSize.height)

    return {
      x: clamp(selection.x, 0, imageSize.width - safeWidth),
      y: clamp(selection.y, 0, imageSize.height - safeHeight),
      width: safeWidth,
      height: safeHeight,
    }
  }, [imageSize.height, imageSize.width, selection])

  const recentFilesWithDisplayLabel = useMemo(() => {
    const labelCounts = new Map()

    for (const entry of recentFiles) {
      labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1)
    }

    const seenLabels = new Map()

    return recentFiles.map((entry) => {
      if ((labelCounts.get(entry.label) ?? 0) <= 1) {
        return {
          ...entry,
          displayLabel: entry.label,
        }
      }

      const nextIndex = (seenLabels.get(entry.label) ?? 0) + 1
      seenLabels.set(entry.label, nextIndex)

      return {
        ...entry,
        displayLabel: `${entry.label} (${nextIndex})`,
      }
    })
  }, [recentFiles])

  const frameArguments = `${boundedSelection.x}, ${boundedSelection.y}, ${boundedSelection.width}, ${boundedSelection.height}`

  function normalizeSelection(nextSelection) {
    if (!imageSize.width || !imageSize.height) {
      return {
        x: Math.max(0, Math.floor(nextSelection.x ?? 0)),
        y: Math.max(0, Math.floor(nextSelection.y ?? 0)),
        width: Math.max(1, Math.floor(nextSelection.width ?? 1)),
        height: Math.max(1, Math.floor(nextSelection.height ?? 1)),
      }
    }

    const width = clamp(Math.floor(nextSelection.width ?? boundedSelection.width), 1, imageSize.width)
    const height = clamp(Math.floor(nextSelection.height ?? boundedSelection.height), 1, imageSize.height)

    return {
      x: clamp(Math.floor(nextSelection.x ?? boundedSelection.x), 0, imageSize.width - width),
      y: clamp(Math.floor(nextSelection.y ?? boundedSelection.y), 0, imageSize.height - height),
      width,
      height,
    }
  }

  function getPointerCoordinates(event) {
    if (!imageRef.current || !imageSize.width || !imageSize.height) {
      return null
    }

    const bounds = imageRef.current.getBoundingClientRect()
    if (!bounds.width || !bounds.height) {
      return null
    }

    return {
      x: clamp(
        Math.floor(((event.clientX - bounds.left) / bounds.width) * imageSize.width),
        0,
        imageSize.width - 1,
      ),
      y: clamp(
        Math.floor(((event.clientY - bounds.top) / bounds.height) * imageSize.height),
        0,
        imageSize.height - 1,
      ),
    }
  }

  useEffect(() => {
    return () => {
      if (imageSource) {
        URL.revokeObjectURL(imageSource)
      }
    }
  }, [imageSource])

  useEffect(() => {
    if (!copyStatus) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setCopyStatus('')
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [copyStatus])

  useEffect(() => {
    if (!imageRef.current || !sourceCanvasRef.current || !imageSize.width || !imageSize.height) {
      return
    }

    const imageElement = imageRef.current
    const canvas = sourceCanvasRef.current
    canvas.width = imageSize.width
    canvas.height = imageSize.height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(imageElement, 0, 0, imageSize.width, imageSize.height)

    const nextSelection = boundedSelection
    const imageData = context.getImageData(
      nextSelection.x,
      nextSelection.y,
      nextSelection.width,
      nextSelection.height,
    )

    setSelectionData(summarizePixels(imageData))
  }, [boundedSelection, imageSize.height, imageSize.width, imageSource])

  useEffect(() => {
    if (!selectionData || !previewCanvasRef.current || !sourceCanvasRef.current) {
      return
    }

    const previewCanvas = previewCanvasRef.current
    const longestSide = Math.max(boundedSelection.width, boundedSelection.height)
    const scale = previewFrameSize / longestSide
    previewCanvas.width = Math.max(1, Math.round(boundedSelection.width * scale))
    previewCanvas.height = Math.max(1, Math.round(boundedSelection.height * scale))

    const previewContext = previewCanvas.getContext('2d')
    previewContext.imageSmoothingEnabled = false
    previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    previewContext.drawImage(
      sourceCanvasRef.current,
      boundedSelection.x,
      boundedSelection.y,
      boundedSelection.width,
      boundedSelection.height,
      0,
      0,
      previewCanvas.width,
      previewCanvas.height,
    )
  }, [boundedSelection, selectionData])

  useEffect(() => {
    if (
      previousZoomRef.current === zoom ||
      !imageSource ||
      !imageSize.width ||
      !imageSize.height ||
      !imageScrollRef.current ||
      !imageRef.current
    ) {
      previousZoomRef.current = zoom
      return undefined
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const scrollContainer = imageScrollRef.current
      const selectionOverlay = selectionOverlayRef.current

      if (!scrollContainer || !selectionOverlay) {
        previousZoomRef.current = zoom
        return
      }

      const selectionLeft = selectionOverlay.offsetLeft
      const selectionTop = selectionOverlay.offsetTop
      const selectionCenterX = selectionLeft + selectionOverlay.offsetWidth / 2
      const selectionCenterY = selectionTop + selectionOverlay.offsetHeight / 2

      scrollContainer.scrollLeft = clamp(
        selectionCenterX - scrollContainer.clientWidth / 2,
        0,
        scrollContainer.scrollWidth - scrollContainer.clientWidth,
      )
      scrollContainer.scrollTop = clamp(
        selectionCenterY - scrollContainer.clientHeight / 2,
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
      )

      previousZoomRef.current = zoom
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [zoom, boundedSelection, imageSize.height, imageSize.width, imageSource])

  function updateSelection(field, value) {
    setSelection((current) => {
      if (isPositionLocked && (field === 'x' || field === 'y')) {
        const sharedValue = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))

        return normalizeSelection({
          ...current,
          x: sharedValue,
          y: sharedValue,
        })
      }

      if (isSizeLocked && (field === 'width' || field === 'height')) {
        const sharedValue = Math.max(1, Math.floor(Number.isFinite(value) ? value : 1))

        return normalizeSelection({
          ...current,
          width: sharedValue,
          height: sharedValue,
        })
      }

      const nextValue = Number.isFinite(value) ? value : 0

      return normalizeSelection({
        ...current,
        [field]: Math.max(0, Math.floor(nextValue)),
      })
    })
  }

  function moveSelectionBy(deltaX, deltaY) {
    setSelection((current) => normalizeSelection({
      ...current,
      x: current.x + deltaX,
      y: current.y + deltaY,
    }))
  }

  function handlePreviewKeyDown(event) {
    if (!imageSource) {
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelectionBy(0, -1)
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelectionBy(0, 1)
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveSelectionBy(-1, 0)
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveSelectionBy(1, 0)
    }
  }

  function togglePositionLock() {
    setIsPositionLocked((currentLock) => {
      const nextLock = !currentLock

      if (nextLock) {
        setSelection((current) => {
          const sharedValue = Math.min(current.x, current.y)

          return normalizeSelection({
            ...current,
            x: sharedValue,
            y: sharedValue,
          })
        })
      }

      return nextLock
    })
  }

  function toggleSizeLock() {
    setIsSizeLocked((currentLock) => {
      const nextLock = !currentLock

      if (nextLock) {
        setSelection((current) => {
          const sharedValue = Math.min(current.width, current.height)

          return normalizeSelection({
            ...current,
            width: sharedValue,
            height: sharedValue,
          })
        })
      }

      return nextLock
    })
  }

  function applyImageSource(nextImageSource, nextImageName) {
    setErrorMessage('')
    setCopyStatus('')
    setImageName(nextImageName)
    setZoom(1)
    setImageSource(nextImageSource)
  }

  function rememberRecentFile(file) {
    const fileKey = `${file.name}:${file.size}:${file.lastModified}:${file.type}`

    setRecentFiles((current) => {
      if (current.some((entry) => entry.key === fileKey)) {
        return current
      }

      const nextFiles = [{ key: fileKey, file, label: file.name?.trim() || 'Pasted image' }, ...current]

      return nextFiles.slice(0, 10)
    })
  }

  function loadImageFile(file, options = {}) {
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Choose a valid image file.')
      return
    }

    if (options.remember !== false) {
      rememberRecentFile(file)
    }

    applyImageSource(URL.createObjectURL(file), file.name?.trim() || 'Pasted image')
  }

  function removeRecentFile(fileKey) {
    setRecentFiles((current) => current.filter((entry) => entry.key !== fileKey))
  }

  useEffect(() => {
    function handlePaste(event) {
      if (isEditableTarget(event.target)) {
        return
      }

      const imageItem = [...(event.clipboardData?.items ?? [])].find((item) =>
        item.type.startsWith('image/'),
      )

      if (imageItem) {
        const file = imageItem.getAsFile()

        if (!file) {
          return
        }

        event.preventDefault()
        loadImageFile(file)
        return
      }

      const pastedText =
        typeof event.clipboardData?.getData === 'function'
          ? event.clipboardData.getData('text/plain')
          : ''
      const pastedSelection = parsePastedSelection(pastedText)

      if (
        !imageSource ||
        !imageSize.width ||
        !imageSize.height ||
        !pastedSelection ||
        pastedSelection.x < 0 ||
        pastedSelection.y < 0 ||
        pastedSelection.width < 1 ||
        pastedSelection.height < 1 ||
        pastedSelection.x + pastedSelection.width > imageSize.width ||
        pastedSelection.y + pastedSelection.height > imageSize.height
      ) {
        return
      }

      event.preventDefault()
      setSelection(normalizeSelection(pastedSelection))
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [imageSize.height, imageSize.width, imageSource])

  function handleUpload(event) {
    loadImageFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleDragEnter(event) {
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  function handleDragOver(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragActive(true)
  }

  function handleDragLeave(event) {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragActive(false)
    loadImageFile(event.dataTransfer.files?.[0])
  }

  function handleImageWheel(event) {
    if (!imageSource || (!event.altKey && !event.ctrlKey)) {
      return
    }

    event.preventDefault()

    setZoom((current) => {
      const nextZoom = clamp(
        Number((current * Math.exp(-event.deltaY * 0.001)).toFixed(2)),
        1,
        12,
      )

      return nextZoom
    })
  }

  function handleImageLoad(event) {
    const nextWidth = event.currentTarget.naturalWidth
    const nextHeight = event.currentTarget.naturalHeight

    setImageSize({ width: nextWidth, height: nextHeight })
    setSelection((current) => ({
      x: clamp(current.x, 0, Math.max(0, nextWidth - 1)),
      y: clamp(current.y, 0, Math.max(0, nextHeight - 1)),
      width: clamp(current.width, 1, nextWidth),
      height: clamp(current.height, 1, nextHeight),
    }))
  }

  async function copySelectionToClipboard() {
    const text = frameArguments

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'absolute'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      setCopyStatus('Copied to clipboard')
    } catch {
      setCopyStatus('Clipboard copy failed')
    }
  }

  function beginInteraction(mode, event) {
    const startPoint = getPointerCoordinates(event)

    if (!startPoint) {
      return
    }

    imageSurfaceRef.current?.setPointerCapture(event.pointerId)
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      captureTarget: imageSurfaceRef.current,
      startPoint,
      startSelection: boundedSelection,
    }
  }

  function beginPreviewDrag(event) {
    if (!previewCanvasRef.current) {
      return
    }

    previewCanvasRef.current.setPointerCapture(event.pointerId)
    interactionRef.current = {
      mode: 'preview-drag',
      pointerId: event.pointerId,
      captureTarget: previewCanvasRef.current,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSelection: boundedSelection,
    }
  }

  function handleStagePointerDown(event) {
    if (!imageSource) {
      return
    }

    const point = getPointerCoordinates(event)

    if (!point) {
      return
    }

    setSelection((current) => normalizeSelection({
      ...current,
      x: point.x - Math.floor(current.width / 2),
      y: point.y - Math.floor(current.height / 2),
    }))
  }

  function handleOverlayPointerDown(event) {
    event.stopPropagation()
    beginInteraction('drag', event)
  }

  function handleResizePointerDown(event) {
    event.stopPropagation()
    beginInteraction('resize', event)
  }

  function handleSurfacePointerMove(event) {
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== event.pointerId || interaction.mode === 'preview-drag') {
      return
    }

    const point = getPointerCoordinates(event)

    if (!point) {
      return
    }

    if (interaction.mode === 'drag') {
      const deltaX = point.x - interaction.startPoint.x
      const deltaY = point.y - interaction.startPoint.y

      setSelection(
        normalizeSelection({
          ...interaction.startSelection,
          x: interaction.startSelection.x + deltaX,
          y: interaction.startSelection.y + deltaY,
        }),
      )

      return
    }

    setSelection(
      normalizeSelection({
        ...interaction.startSelection,
        width: point.x - interaction.startSelection.x + 1,
        height: point.y - interaction.startSelection.y + 1,
      }),
    )
  }

  function handlePreviewPointerDown(event) {
    if (!imageSource) {
      return
    }

    beginPreviewDrag(event)
  }

  function handlePreviewPointerMove(event) {
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== event.pointerId || interaction.mode !== 'preview-drag') {
      return
    }

    if (!previewCanvasRef.current) {
      return
    }

    const bounds = previewCanvasRef.current.getBoundingClientRect()

    if (!bounds.width || !bounds.height) {
      return
    }

    const direction = previewDragMode === 'pan' ? -1 : 1
    const deltaX = Math.round(
      ((event.clientX - interaction.startClientX) / bounds.width) * interaction.startSelection.width,
    )
    const deltaY = Math.round(
      ((event.clientY - interaction.startClientY) / bounds.height) * interaction.startSelection.height,
    )

    setSelection(
      normalizeSelection({
        ...interaction.startSelection,
        x: interaction.startSelection.x + deltaX * direction,
        y: interaction.startSelection.y + deltaY * direction,
      }),
    )
  }

  function endInteraction(event) {
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    interactionRef.current = null

    if (interaction.captureTarget?.hasPointerCapture(event.pointerId)) {
      interaction.captureTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Sprite Inspector</p>
          <h1>Upload an image and inspect an exact region.</h1>
          <p className="lead">
            Enter <code>x</code>, <code>y</code>, <code>width</code>, and <code>height</code> to see
            the crop, dominant colors, and pixel values.
          </p>
        </div>
        <div
          className={`upload-card${isDragActive ? ' upload-card-active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="upload-card-main">
            <div className="upload-primary">
              <div className="upload-input-label">
                <span className="upload-label">Choose image</span>
                <button
                  type="button"
                  className="upload-picker-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  id="sprite-upload-input"
                  className="upload-hidden-input"
                  type="file"
                  accept="image/*"
                  aria-label="Choose image"
                  onChange={handleUpload}
                />
              </div>
              <strong>{imageName}</strong>
              <span className="upload-hint">
                {isDragActive
                  ? 'Drop image here'
                  : 'Drag and drop, or paste an image'}
              </span>
            </div>
            <div className="recent-files" aria-label="Recent images">
              <span className="recent-files-label">Recent images</span>
              <div className="recent-files-list">
                {recentFilesWithDisplayLabel.map((entry) => (
                  <div key={entry.key} className="recent-file-row">
                    <button
                      type="button"
                      className="recent-file-link"
                      onClick={() => loadImageFile(entry.file, { remember: false })}
                      title={entry.displayLabel}
                    >
                      {entry.displayLabel}
                    </button>
                    <button
                      type="button"
                      className="recent-file-remove"
                      onClick={() => removeRecentFile(entry.key)}
                      aria-label={`Remove ${entry.displayLabel} from recent images`}
                      title={`Remove ${entry.displayLabel}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      <section className="workspace">
        <article className="panel controls-panel">
          <div className="panel-heading">
            <h2>Region</h2>
            <p>
              {imageSize.width && imageSize.height
                ? `${imageSize.width} × ${imageSize.height}px`
                : 'Upload an image to begin'}
            </p>
          </div>

          <div className="input-grid">
            {[
              {
                fields: ['x', 'y'],
                isLocked: isPositionLocked,
                onToggle: togglePositionLock,
                label: isPositionLocked ? 'Unlock x and y values' : 'Lock x and y values',
              },
              {
                fields: ['width', 'height'],
                isLocked: isSizeLocked,
                onToggle: toggleSizeLock,
                label: isSizeLocked ? 'Unlock width and height values' : 'Lock width and height values',
              },
            ].map((group) => (
              <div key={group.fields.join('-')} className="field-row">
                <label className="field">
                  <span>{group.fields[0]}</span>
                  <input
                    type="number"
                    min="0"
                    value={boundedSelection[group.fields[0]]}
                    onChange={(event) => updateSelection(group.fields[0], event.target.valueAsNumber)}
                    disabled={!imageSource}
                  />
                </label>
                <button
                  type="button"
                  className={`lock-toggle${group.isLocked ? ' lock-toggle-active' : ''}`}
                  onClick={group.onToggle}
                  disabled={!imageSource}
                  aria-pressed={group.isLocked}
                  aria-label={group.label}
                  title={group.label}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="lock-toggle-icon">
                    {group.isLocked ? (
                      <path
                        d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z"
                        fill="currentColor"
                      />
                    ) : (
                      <>
                        <path
                          d="M7 10V8a5 5 0 0 1 9.4-2.3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M17 10h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h11Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </>
                    )}
                  </svg>
                </button>
                <label className="field">
                  <span>{group.fields[1]}</span>
                  <input
                    type="number"
                    min={group.fields[1] === 'height' ? '1' : '0'}
                    value={boundedSelection[group.fields[1]]}
                    onChange={(event) => updateSelection(group.fields[1], event.target.valueAsNumber)}
                    disabled={!imageSource}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="selection-meta">
            <div>
              <span>Start</span>
              <strong>
                ({boundedSelection.x}, {boundedSelection.y})
              </strong>
            </div>
            <div>
              <span>End</span>
              <strong>
                ({boundedSelection.x + boundedSelection.width - 1},{' '}
                {boundedSelection.y + boundedSelection.height - 1})
              </strong>
            </div>
            <div>
              <span>Pixels</span>
              <strong>{selectionData?.pixelCount ?? 0}</strong>
            </div>
          </div>

        </article>

        <article className="panel viewer-panel">
          <div className="panel-heading panel-heading-split">
            <div>
              <h2>Image</h2>
              <p>The selected region is highlighted in the preview.</p>
            </div>
            <div className="viewer-toolbar">
              <label className="zoom-control">
                <span>Zoom</span>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="0.25"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  disabled={!imageSource}
                />
                <strong>{Math.round(zoom * 100)}%</strong>
              </label>
            </div>
          </div>

          <div className="image-stage">
            {imageSource ? (
              <div
                ref={imageScrollRef}
                className="image-scroll"
                onWheel={handleImageWheel}
              >
                <div
                  ref={imageSurfaceRef}
                  className="image-surface"
                  style={{ width: `${zoom * 100}%` }}
                  onPointerDown={handleStagePointerDown}
                  onPointerMove={handleSurfacePointerMove}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                >
                  <img
                    ref={imageRef}
                    src={imageSource}
                    alt="Uploaded sprite"
                    onLoad={handleImageLoad}
                    className="sprite-image"
                  />
                  {imageSize.width && imageSize.height ? (
                    <div
                      ref={selectionOverlayRef}
                      className="selection-overlay"
                      onPointerDown={handleOverlayPointerDown}
                      style={{
                        left: `${(boundedSelection.x / imageSize.width) * 100}%`,
                        top: `${(boundedSelection.y / imageSize.height) * 100}%`,
                        width: `${(boundedSelection.width / imageSize.width) * 100}%`,
                        height: `${(boundedSelection.height / imageSize.height) * 100}%`,
                      }}
                    >
                      <button
                        type="button"
                        className="selection-resize-handle"
                        aria-label="Resize selected region"
                        onPointerDown={handleResizePointerDown}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No image selected.</p>
              </div>
            )}
          </div>
          <canvas ref={sourceCanvasRef} className="hidden-canvas" />
        </article>

        <article className="panel output-panel">
          <div className="panel-heading">
            <h2>Output</h2>
            <p>Crop and color summary for the selected region.</p>
          </div>

          <div className="output-stack">
            <div className="frame-output">
              <div className="frame-output-header">
                <span>Frame</span>
                <button
                  type="button"
                  className="copy-link"
                  onClick={copySelectionToClipboard}
                  disabled={!imageSource}
                  title="Copy region as x, y, width, height arguments"
                  aria-label="Copy region as x, y, width, height arguments"
                >
                  Copy
                </button>
              </div>
              <code>{frameArguments}</code>
              <span className="clipboard-status" aria-live="polite">
                {copyStatus}
              </span>
            </div>

            <div className="crop-preview">
              <div className="crop-preview-header">
                <span>Crop — drag to reposition</span>
              </div>
              {imageSource ? (
                <div
                  className="crop-preview-workbench"
                  tabIndex={0}
                  onKeyDown={handlePreviewKeyDown}
                  aria-label="Crop preview controls"
                >
                  <div className="frame-nudge-controls" aria-label="Move selected region">
                    <button
                      type="button"
                      className="nudge-button nudge-button-up"
                      onClick={() => moveSelectionBy(0, -1)}
                      disabled={!imageSource || boundedSelection.y === 0}
                      aria-label="Move selection up one pixel"
                      title="Move up 1px"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="nudge-button nudge-button-left"
                      onClick={() => moveSelectionBy(-1, 0)}
                      disabled={!imageSource || boundedSelection.x === 0}
                      aria-label="Move selection left one pixel"
                      title="Move left 1px"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="nudge-button nudge-button-right"
                      onClick={() => moveSelectionBy(1, 0)}
                      disabled={!imageSource || boundedSelection.x + boundedSelection.width >= imageSize.width}
                      aria-label="Move selection right one pixel"
                      title="Move right 1px"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="nudge-button nudge-button-down"
                      onClick={() => moveSelectionBy(0, 1)}
                      disabled={!imageSource || boundedSelection.y + boundedSelection.height >= imageSize.height}
                      aria-label="Move selection down one pixel"
                      title="Move down 1px"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="crop-preview-frame">
                    <canvas
                      ref={previewCanvasRef}
                      className="crop-preview-canvas"
                      onPointerDown={handlePreviewPointerDown}
                      onPointerMove={handlePreviewPointerMove}
                      onPointerUp={endInteraction}
                      onPointerCancel={endInteraction}
                    />
                  </div>
                </div>
              ) : (
                <p className="muted">No image selected.</p>
              )}
              <div className="drag-mode-toggle">
                <label>
                  <input
                    type="radio"
                    name="preview-drag-mode"
                    value="pan"
                    checked={previewDragMode === 'pan'}
                    onChange={() => setPreviewDragMode('pan')}
                  />
                  Pan image
                </label>
                <label>
                  <input
                    type="radio"
                    name="preview-drag-mode"
                    value="selection"
                    checked={previewDragMode === 'selection'}
                    onChange={() => setPreviewDragMode('selection')}
                  />
                  Move selection
                </label>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Unique colors</span>
                <strong>{selectionData?.uniqueColorCount ?? 0}</strong>
              </div>
              <div className="stat-card">
                <span>Average color</span>
                <strong>
                  {selectionData
                    ? rgbaToHex(
                        selectionData.average.r,
                        selectionData.average.g,
                        selectionData.average.b,
                        selectionData.average.a,
                      )
                    : 'No data'}
                </strong>
              </div>
            </div>

            <div>
              <h3>Dominant colors</h3>
              <div className="color-list">
                {selectionData?.dominantColors?.length ? (
                  selectionData.dominantColors.map((color) => (
                    <div key={color.key} className="color-row">
                      <span className="swatch" style={{ background: color.swatch }} />
                      <code>{color.label}</code>
                      <span>{color.count} px</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">No data yet.</p>
                )}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}
