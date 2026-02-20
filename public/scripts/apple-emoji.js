// Replaces emoji grapheme clusters in text nodes with Apple emoji PNGs
// served from the emoji-datasource-apple package via jsDelivr.
(function () {
  'use strict'

  const EMOJI_CDN_BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@latest/img/apple/64'

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
        img.src = `${EMOJI_CDN_BASE}/${filename}.png`
        img.alt = seg
        img.draggable = false
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
