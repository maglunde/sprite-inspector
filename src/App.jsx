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

function rgbaToHex(r, g, b, a) {
  const alpha = Math.round((a / 255) * 100)
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')} (${alpha}%)`
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

  const matrix = []
  const isMatrixVisible = pixelCount <= 256

  if (isMatrixVisible) {
    for (let row = 0; row < height; row += 1) {
      const currentRow = []

      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4
        currentRow.push(
          rgbaToHex(data[index], data[index + 1], data[index + 2], data[index + 3]),
        )
      }

      matrix.push(currentRow)
    }
  }

  return {
    average,
    dominantColors,
    uniqueColorCount: histogram.size,
    pixelCount,
    matrix,
    isMatrixVisible,
  }
}

export default function App() {
  const [selection, setSelection] = useState(DEFAULT_SELECTION)
  const [imageSource, setImageSource] = useState('')
  const [imageName, setImageName] = useState('No file uploaded')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [selectionData, setSelectionData] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const imageRef = useRef(null)
  const imageScrollRef = useRef(null)
  const imageSurfaceRef = useRef(null)
  const selectionOverlayRef = useRef(null)
  const sourceCanvasRef = useRef(null)
  const previewCanvasRef = useRef(null)
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
    const scale = Math.max(1, Math.floor(192 / Math.max(boundedSelection.width, boundedSelection.height)))
    previewCanvas.width = boundedSelection.width * scale
    previewCanvas.height = boundedSelection.height * scale

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
    const nextValue = Number.isFinite(value) ? value : 0
    setSelection((current) => normalizeSelection({
      ...current,
      [field]: Math.max(0, Math.floor(nextValue)),
    }))
  }

  function loadImageFile(file) {
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Choose a valid image file.')
      return
    }

    setErrorMessage('')
    setImageName(file.name)
    setZoom(1)
    setImageSource(URL.createObjectURL(file))
  }

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

    const deltaX = Math.round(
      ((event.clientX - interaction.startClientX) / bounds.width) * interaction.startSelection.width,
    )
    const deltaY = Math.round(
      ((event.clientY - interaction.startClientY) / bounds.height) * interaction.startSelection.height,
    )

    setSelection(
      normalizeSelection({
        ...interaction.startSelection,
        x: interaction.startSelection.x + deltaX,
        y: interaction.startSelection.y + deltaY,
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
        <label
          className={`upload-card${isDragActive ? ' upload-card-active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-label">Choose sprite or image</span>
          <input type="file" accept="image/*" onChange={handleUpload} />
          <strong>{imageName}</strong>
          <span className="upload-hint">
            {isDragActive ? 'Drop image here' : 'PNG, JPG, GIF, or WebP'}
          </span>
        </label>
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
            {['x', 'y', 'width', 'height'].map((field) => (
              <label key={field} className="field">
                <span>{field}</span>
                <input
                  type="number"
                  min="0"
                  value={boundedSelection[field]}
                  onChange={(event) => updateSelection(field, event.target.valueAsNumber)}
                  disabled={!imageSource}
                />
              </label>
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
            <p>Crop, color summary, and pixel contents for the selected region.</p>
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
              {imageSource ? (
                <canvas
                  ref={previewCanvasRef}
                  className="crop-preview-canvas"
                  onPointerDown={handlePreviewPointerDown}
                  onPointerMove={handlePreviewPointerMove}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                />
              ) : (
                <p className="muted">No image selected.</p>
              )}
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

            <div>
              <h3>Pixel values</h3>
              {selectionData?.isMatrixVisible ? (
                <div className="matrix">
                  {selectionData.matrix.map((row, rowIndex) => (
                    <div key={`row-${rowIndex}`} className="matrix-row">
                      {row.map((color, columnIndex) => (
                        <code key={`${rowIndex}-${columnIndex}`}>{color}</code>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  The selected region is larger than 256 pixels. Reduce the size to show all pixel values.
                </p>
              )}
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}
