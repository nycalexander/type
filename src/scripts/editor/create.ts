import { toggleNotesList, updateNotesList } from '@scripts/render/notes'
import { state, updateStatus } from '@scripts/state'
import { clearCurrentId } from '@scripts/utils/currentNote'
import { getByClass } from '@scripts/utils/getElements'
import { setTitle } from '@scripts/utils/setTitle'
import { Editor, rootCtx, editorViewCtx } from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { indent } from '@milkdown/kit/plugin/indent'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { upload } from '@milkdown/kit/plugin/upload'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { automd } from '@milkdown/plugin-automd'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { header } from '@scripts/header/elements'
import { getSpellcheck } from '@scripts/actions/spellcheck'

function markKey(m: any) {
	try {
		return `${m.type.name}:${JSON.stringify(m.attrs || {})}`
	} catch (e) {
		return `${m.type.name}`
	}
}

function markerForMark(m: any) {
	const t = m.type.name
	if (t === 'em' || t === 'emphasis') return '*'
	if (t === 'strong' || t === 'bold') return '**'
	if (t === 'code') return '`'
	return null
}

function createMarkerDom(text: string, cls = '') {
	const span = document.createElement('span')
	span.className = `md-marker ${cls}`.trim()
	span.textContent = text
	return span
}

function buildDecorations(doc: any) {
	const decs: any[] = []
	const activeMarks = new Map<string, { start: number; mark: any }>()

	doc.descendants((node: any, pos: number) => {
		// Block-level markers
		if (node.type && (node.type.name === 'heading')) {
			const level = (node.attrs && node.attrs.level) || 1
			const text = '#'.repeat(level) + ' '
			decs.push(Decoration.widget(pos + 1, createMarkerDom(text, 'md-heading'), { side: -1 }))
			return
		}

		if (node.type && node.type.name === 'blockquote') {
			decs.push(Decoration.widget(pos + 1, createMarkerDom('> ', 'md-quote'), { side: -1 }))
			return
		}

		if (node.type && node.type.name === 'code_block') {
			decs.push(Decoration.widget(pos + 1, createMarkerDom('```', 'md-codeblock'), { side: -1 }))
			decs.push(Decoration.widget(pos + node.nodeSize - 1, createMarkerDom('```', 'md-codeblock-end')))
			return
		}

		// Inline text marks (emphasis, strong, code)
		if (node.isText) {
			const curMarkKeys: string[] = []
			for (const m of node.marks) {
				const k = markKey(m)
				curMarkKeys.push(k)
				if (!activeMarks.has(k)) {
					activeMarks.set(k, { start: pos, mark: m })
				}
			}

			// find marks that ended before this node
			for (const [k, info] of Array.from(activeMarks.entries())) {
				if (!curMarkKeys.includes(k)) {
					const mk = info.mark
					const marker = markerForMark(mk)
					if (marker) {
						decs.push(Decoration.widget(info.start, createMarkerDom(marker, 'md-open ' + mk.type.name), { side: -1 }))
						decs.push(Decoration.widget(pos, createMarkerDom(marker, 'md-close ' + mk.type.name)))
					}
					activeMarks.delete(k)
				}
			}
		}
	})

	// Close any remaining marks at doc end
	const endPos = doc.content.size
	for (const [k, info] of activeMarks.entries()) {
		const mk = info.mark
		const marker = markerForMark(mk)
		if (marker) {
			decs.push(Decoration.widget(info.start, createMarkerDom(marker, 'md-open ' + mk.type.name), { side: -1 }))
			decs.push(Decoration.widget(endPos, createMarkerDom(marker, 'md-close ' + mk.type.name)))
		}
	}

	return DecorationSet.create(doc, decs)
}

export async function createEditor() {
	console.debug(`Loading editor`)
	console.debug(state)
	return await Editor.make()
		.use(commonmark)
		.use(gfm)
		.use(history)
		.use(clipboard)
		.use(upload)
		.use(indent)
		.use(listener)
		.use(automd)
		.config((ctx) => {
			ctx.set(rootCtx, document.getElementById('editor'))
			const listener = ctx.get(listenerCtx)
			listener.mounted(onMounted)
			listener.updated(onUpdated)
		})
		.create()
}

export function onMounted() {
	updateStatus('empty')
	state.editorEl = getByClass('editor')
	state.editorEl.ariaLabel = 'Your note'
	state.editorEl.focus()
	if (state.hasNotes) state.editorEl.classList.add('collapsed')
	state.editorEl.spellcheck = getSpellcheck()
	state.wasEmpty = true
}

export function onUpdated(ctx, doc) {
	console.debug(`Editor updated`)
	state.updated = true
	state.empty = doc.content.size <= 2
	state.menu.toggle(false)

	if (state.empty) {
		console.debug('Turned to empty')
		updateStatus('empty')

		if (state.hasNotes) toggleNotesList(true)

		header.headerLeftEl.dataset.context = 'notes'
		setTitle()
		updateNotesList()
		state.menu.updateActions('empty')
		clearCurrentId()
		state.wasEmpty = true
	} else if (state.wasEmpty) {
		// We don't want to change all this while regular typing
		console.debug('Turned to fill')
		if (state.hasNotes) toggleNotesList(false)
		header.headerLeftEl.dataset.context = 'editor'
		state.wasEmpty = false
		// Change buttons in menu
		if (!state.locked) updateStatus('writing')
	}

	// Apply markdown marker decorations to the editor view when the toggle is active
	try {
		const view = ctx && ctx.get ? ctx.get(editorViewCtx) : null
		const el = (typeof document !== 'undefined') ? (document.getElementById('editor') || document.querySelector('.editor') || document.documentElement) : null
		const show = el && el.classList && el.classList.contains('show-markdown-formatting')
		if (view) {
			if (!show) {
				view.setProps({ decorations: (s) => DecorationSet.empty })
			} else {
				let decs = DecorationSet.empty
				try {
					decs = buildDecorations(doc)
				} catch (e) {
					decs = DecorationSet.empty
				}
				view.setProps({ decorations: (s) => decs })
			}
		}
	} catch (e) {
		console.warn('markdown markers decoration update failed', e)
	}
}