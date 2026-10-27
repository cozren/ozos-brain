import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { ImageLightbox } from '../ImageLightbox'

const props = {
  src: '/asset/diagram.svg',
  alt: 'Ad stack diagram',
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

const zoomLabel = () => screen.getByTestId('lightbox-zoom').textContent

describe('ImageLightbox', () => {
  test('renders the image in a labelled modal dialog', () => {
    render(<ImageLightbox {...props} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Ad stack diagram')
    expect(screen.getByAltText('Ad stack diagram')).toHaveAttribute('src', '/asset/diagram.svg')
  })

  test('falls back to a generic label when the image has no alt text', () => {
    render(<ImageLightbox {...props} alt="" />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/image/i)
  })

  test('opens fitted to the pane at 100%', () => {
    render(<ImageLightbox {...props} />)
    expect(zoomLabel()).toBe('100%')
  })

  test('zoom in raises the zoom level, zoom out lowers it', () => {
    render(<ImageLightbox {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }))
    expect(zoomLabel()).toBe('125%')
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }))
    expect(zoomLabel()).toBe('100%')
  })

  test('reset returns to a fitted 100% view', () => {
    render(<ImageLightbox {...props} />)
    const zoomIn = screen.getByRole('button', { name: /zoom in/i })
    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)
    expect(zoomLabel()).not.toBe('100%')
    fireEvent.click(screen.getByRole('button', { name: /reset|fit/i }))
    expect(zoomLabel()).toBe('100%')
  })

  test('the wheel zooms the image', () => {
    render(<ImageLightbox {...props} />)
    fireEvent.wheel(screen.getByTestId('lightbox-stage'), { deltaY: -100 })
    expect(Number(zoomLabel()!.replace('%', ''))).toBeGreaterThan(100)
  })

  test('zoom buttons disable at the range ends', () => {
    render(<ImageLightbox {...props} />)
    const zoomOut = screen.getByRole('button', { name: /zoom out/i })
    const zoomIn = screen.getByRole('button', { name: /zoom in/i })
    for (let i = 0; i < 20; i++) fireEvent.click(zoomOut)
    expect(zoomOut).toBeDisabled()
    for (let i = 0; i < 40; i++) fireEvent.click(zoomIn)
    expect(zoomIn).toBeDisabled()
  })

  test('Escape closes', () => {
    render(<ImageLightbox {...props} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })

  test('the close button closes', () => {
    render(<ImageLightbox {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(props.onClose).toHaveBeenCalled()
  })

  test('clicking the backdrop closes, clicking the image does not', () => {
    render(<ImageLightbox {...props} />)
    fireEvent.click(screen.getByTestId('lightbox-stage'))
    expect(props.onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByAltText('Ad stack diagram'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  test('offers a link to open the image full-size in a new tab', () => {
    render(<ImageLightbox {...props} />)
    const link = screen.getByRole('link', { name: /new tab/i })
    expect(link).toHaveAttribute('href', '/asset/diagram.svg')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
