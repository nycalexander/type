// Replaces emoji grapheme clusters in text nodes with Apple emoji PNGs
// served from the emoji-datasource-apple package via jsDelivr.
(function () {
  'use strict'

  // CDN base (try larger sizes first, fall back to smaller ones)
  const EMOJI_CDN_BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@latest/img/apple'
  const EMOJI_SIZES = [256, 128]

  // Test for emoji characters (uses Unicode property escape)
  const emojiTest = (() => {
    try {
      return new RegExp('\\p{Emoji}', 'u')
    } catch (e) {
      return null
    }
  })()

  const hasIntlSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'

  function toFilename(grapheme) {
    const cps = []
    for (const ch of [...grapheme]) {
      cps.push(ch.codePointAt(0).toString(16))
    }
    return cps.join('-').toLowerCase()
  }

  function shouldSkipParent(node) {
    const parent = node.parentNode
    if (!parent || parent.nodeType !== 1) return true
    const tag = parent.tagName.toLowerCase()
    if (['script', 'style', 'textarea', 'code', 'pre', 'svg'].includes(tag)) return true
    if (parent.isContentEditable) return true
    return false
  }

  function processTextNode(node) {
    const text = node.nodeValue
    if (!text || !text.trim()) return

    const segments = hasIntlSegmenter
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
      : Array.from(text)

    // Quick check for emoji presence
    if (emojiTest && !emojiTest.test(text)) return

    const frag = document.createDocumentFragment()
    let replaced = false
    for (const seg of segments) {
      const isEmoji = emojiTest ? emojiTest.test(seg) : /[\u{1F300}-\u{1FAFF}]/u.test(seg)
      if (isEmoji) {
        replaced = true
        const filename = toFilename(seg)
        const img = document.createElement('img')
        img.className = 'apple-emoji'
        img.decoding = 'async'
        img.crossOrigin = 'anonymous'
        // Try preferred sizes (256 -> 128). If a size 404s, the onerror handler will try the next.
        let _sizeIndex = 0
        const _setSrcForSize = (i) => {
          if (i >= EMOJI_SIZES.length) return
          img.src = `${EMOJI_CDN_BASE}/${EMOJI_SIZES[i]}/${filename}.png`
          img.dataset.emojiSize = EMOJI_SIZES[i]
          img.onerror = () => {
            img.onerror = null
            _setSrcForSize(i + 1)
          }
        }
        _setSrcForSize(0)
        img.alt = seg
        img.draggable = false

        // After load, attempt high-quality downscale. Use createImageBitmap when available,
        // fallback to a Lanczos resample implemented in JS.
        img.addEventListener('load', () => {
          try {
            const parent = img.parentElement || document.documentElement
            const fontSize = parseFloat(getComputedStyle(parent).fontSize) || 16
            const cssPx = Math.max(12, Math.round(fontSize))
            const dpr = Math.max(1, window.devicePixelRatio || 1)
            const targetPx = Math.max(12, Math.round(cssPx * dpr))

            // Prefer createImageBitmap with resizeQuality when available
            if (typeof createImageBitmap === 'function') {
              try {
                createImageBitmap(img, { resizeWidth: targetPx, resizeHeight: targetPx, resizeQuality: 'high' })
                  .then((bitmap) => {
                    const canvas = document.createElement('canvas')
                    canvas.width = targetPx
                    canvas.height = targetPx
                    const ctx = canvas.getContext('2d')
                    ctx.imageSmoothingEnabled = true
                    ctx.imageSmoothingQuality = 'high'
                    ctx.drawImage(bitmap, 0, 0, targetPx, targetPx)
                    canvas.className = 'apple-emoji'
                    canvas.setAttribute('role', 'img')
                    canvas.setAttribute('aria-label', img.alt || '')
                    canvas.draggable = false
                    // Force CSS display size to 1em so browser downsamples high-res canvas smoothly
                    canvas.style.width = '1em'
                    canvas.style.height = '1em'
                    canvas.style.verticalAlign = '-0.125em'
                    img.replaceWith(canvas)
                  })
                return
              } catch (err) {
                // fall through to Lanczos fallback
              }
            }

            // Lanczos fallback: separable resampling (a = 3)
            function lanczos(x, a) {
              if (x === 0) return 1
              if (x <= -a || x >= a) return 0
              const piX = Math.PI * x
              const sinc = Math.sin(piX) / piX
              const sincA = Math.sin(piX / a) / (piX / a)
              return sinc * sincA
            }

            function lanczosResize(imgEl, dst) {
              const sw = imgEl.naturalWidth
              const sh = imgEl.naturalHeight
              const dw = dst
              const dh = dst

              const srcCanvas = document.createElement('canvas')
              srcCanvas.width = sw
              srcCanvas.height = sh
              const sctx = srcCanvas.getContext('2d')
              sctx.imageSmoothingEnabled = true
              sctx.imageSmoothingQuality = 'high'
              sctx.drawImage(imgEl, 0, 0)
              const srcData = sctx.getImageData(0, 0, sw, sh).data

              const a = 3
              const tmp = new Float32Array(dw * sh * 4)

              // Horizontal pass
              for (let y = 0; y < sh; y++) {
                for (let x = 0; x < dw; x++) {
                  const cx = (x + 0.5) * sw / dw - 0.5
                  const left = Math.floor(cx - a + 1)
                  const right = Math.ceil(cx + a - 1)
                  let wsum = 0
                  let r = 0, g = 0, b = 0, aa = 0
                  for (let sx = left; sx <= right; sx++) {
                    const scx = Math.min(sw - 1, Math.max(0, sx))
                    const w = lanczos(cx - sx, a)
                    if (w === 0) continue
                    wsum += w
                    const si = (y * sw + scx) * 4
                    r += srcData[si] * w
                    g += srcData[si + 1] * w
                    b += srcData[si + 2] * w
                    aa += srcData[si + 3] * w
                  }
                  const di = (y * dw + x) * 4
                  if (wsum !== 0) {
                    tmp[di] = r / wsum
                    tmp[di + 1] = g / wsum
                    tmp[di + 2] = b / wsum
                    tmp[di + 3] = aa / wsum
                  } else {
                    tmp[di] = tmp[di + 1] = tmp[di + 2] = 0
                    tmp[di + 3] = 255
                  }
                }
              }

              // Vertical pass
              const dstBuf = new Uint8ClampedArray(dw * dh * 4)
              for (let x = 0; x < dw; x++) {
                for (let y = 0; y < dh; y++) {
                  const cy = (y + 0.5) * sh / dh - 0.5
                  const top = Math.floor(cy - a + 1)
                  const bottom = Math.ceil(cy + a - 1)
                  let wsum = 0
                  let r = 0, g = 0, b = 0, aa = 0
                  for (let sy = top; sy <= bottom; sy++) {
                    const scy = Math.min(sh - 1, Math.max(0, sy))
                    const w = lanczos(cy - sy, a)
                    if (w === 0) continue
                    wsum += w
                    const ti = (scy * dw + x) * 4
                    r += tmp[ti] * w
                    g += tmp[ti + 1] * w
                    b += tmp[ti + 2] * w
                    aa += tmp[ti + 3] * w
                  }
                  const di = (y * dw + x) * 4
                  if (wsum !== 0) {
                    dstBuf[di] = Math.round(r / wsum)
                    dstBuf[di + 1] = Math.round(g / wsum)
                    dstBuf[di + 2] = Math.round(b / wsum)
                    dstBuf[di + 3] = Math.round(aa / wsum)
                  } else {
                    dstBuf[di] = dstBuf[di + 1] = dstBuf[di + 2] = 0
                    dstBuf[di + 3] = 255
                  }
                }
              }

              const canvas = document.createElement('canvas')
              canvas.width = dw
              canvas.height = dh
              const ctx = canvas.getContext('2d')
              const imageData = ctx.createImageData(dw, dh)
              imageData.data.set(dstBuf)
              ctx.putImageData(imageData, 0, 0)
              return canvas
            }

            try {
              const c = lanczosResize(img, targetPx)
              c.className = 'apple-emoji'
              c.setAttribute('role', 'img')
              c.setAttribute('aria-label', img.alt || '')
              c.draggable = false
              c.style.width = '1em'
              c.style.height = '1em'
              c.style.verticalAlign = '-0.125em'
              img.replaceWith(c)
            } catch (err) {
              // If anything goes wrong, leave the original image as-is
              console.warn('Emoji downscale failed, leaving original image', err)
            }
          } catch (e) {
            // Ignore downscale errors
          }
        })

        frag.appendChild(img)
      } else {
        frag.appendChild(document.createTextNode(seg))
      }
    }

    if (replaced) node.parentNode.replaceChild(frag, node)
  }

  function replaceEmojis(root) {
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
          if (shouldSkipParent(node)) return NodeFilter.FILTER_REJECT
          if (emojiTest && !emojiTest.test(node.nodeValue)) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })

      const nodes = []
      let cur
      while ((cur = walker.nextNode())) nodes.push(cur)

      for (const n of nodes) processTextNode(n)
    } catch (err) {
      // If TreeWalker or Unicode property escapes fail, skip gracefully
      console.warn('Apple emoji replacement skipped:', err)
    }
  }

  function init() {
    replaceEmojis(document.body)

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) replaceEmojis(node)
          else if (node.nodeType === 3) {
            if (!shouldSkipParent(node) && emojiTest && emojiTest.test(node.nodeValue)) processTextNode(node)
          }
        }
      }
    })

    mo.observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
