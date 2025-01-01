const ob = require('obsidian')
, { SearchCursor, RegExpCursor } = require('@codemirror/search')
, { Decoration, ViewPlugin } = require('@codemirror/view')
, S = String.raw
, DBCMarks = '[！，。？；：（）《》【】「」、]'
, editing = {
  'SP2': ' {2}',
  'SP4': ' {4}',
  'DBC': S`${DBCMarks} (?!\^|#)|(?<! |#|^ *?(-|\d+?\.)) ${DBCMarks}`,
  'eng': '[]',
}
, reading = {
  'cm-query': '[]',
}
, all = Object.assign(editing, reading)
module.exports = class extends ob.Plugin {
  onload() {
    import_onSelect().call(this)
    import_onQuery(this.app, all).call(this)
    inPreview.call(this, reading)
  }
  onunload() {}
}
const import_onSelect = ()=> {
  const mark = (view, query, cls, flag, maxMatches)=> {
    const r = []
    for (const port of view.visibleRanges) {
      const matcher = new SearchCursor(view.state.doc, query, port.from, port.to, s=> s.toLowerCase())
      while (!matcher.next().done) {
        const { from, to } = matcher.value
        if (flag(from, to)) r.push(Decoration.mark({class: cls}).range(from, to))
        if (r.length > maxMatches) return []
      }
    }
    return r
  }
  class onSelect {
    minSelectLen = 1; maxSelectLen = 200
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        update.docChanged ? this.decos = null : setTimeout(()=> this.decos = null, 100)
        this.getDecos2(update.view)
      }
    }
    getDecos2 = (ob.debounce)(this.getDecos, 150, !0)
    getDecos(view) {
      const { ranges, main: range } = view.state.selection
      if (range.empty) return; const len = range.to - range.from, decos = []
      if (ranges.length < 2 && this.minSelectLen <= len && len <= this.maxSelectLen) {
        const slc = view.state.sliceDoc(range.from, range.to).trim()
        decos.push(...mark(view, slc, 'cm-select', (from, to)=> from >= range.to || to <= range.from, 200))
      }
      decos.push(...mark(view, ' ', 'SP1', (from, to)=> from < range.to && to > range.from))
      this.decos = Decoration.set(decos, !0); view.update([])
    }
  }
  return function() {
    this.registerEditorExtension([
      ViewPlugin.fromClass(onSelect, {decorations: plug=> plug.decos || Decoration.none})
    ])
  }
}
const eq = (obj1, obj2)=> JSON.stringify(obj1) === JSON.stringify(obj2)
const clone = (obj)=> {
  const cloned = {}; for (const key in obj) cloned[key] = obj[key]; return cloned
}
const import_onQuery = (app, opts)=> {
  const updateConf = ()=> {
    app.workspace.iterateAllLeaves(leaf=> {
      const view = leaf.view?.currentMode?.cm
      if (view) view.dispatch()
    })
  }
  const 结果高亮 = (editor)=> {
    const str = editor.getSelection()
    if (opts.T1 == '[]' && !str) return
    opts.T1 = str || '[]'; updateConf()
  }
  const 中英切换 = ()=> {
    opts.eng = opts.eng == '[]' ? '[a-zA-Z]+' : '[]'
    updateConf()
  }
  const onQuery = class {
    update(update) {
      if (update.viewportChanged || update.docChanged || !eq(this.prev, opts)) {
        this.decos = null; this.getDecos(update.view)
      }
    }
    getDecos(view) {
      const { state } = view, decos = []
      for (const port of view.visibleRanges) {
        for (const [cls, query] of Object.entries(opts)) {
          const matcher = new RegExpCursor(state.doc, query, {}, port.from, port.to)
          while (!matcher.next().done) {
            const { from, to } = matcher.value
            decos.push(Decoration.mark({class: cls}).range(from, to))
          }
        }
      }
      this.decos = Decoration.set(decos, !0); this.prev = clone(opts)
    }
  }
  return function() {
    [ ['deco-result', '结果高亮', 结果高亮],
      ['deco-eng', '中英切换', 中英切换],
    ].map(([id, name, editorCallback, hotkeys])=> this.addCommand({id, name, editorCallback, hotkeys}))
    this.registerEditorExtension([
      ViewPlugin.fromClass(onQuery, {decorations: plug=> plug.decos || Decoration.none})
    ])
  }
}
function inPreview(opts) {
  this.registerMarkdownPostProcessor(el=> {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node; const matches = []
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim()
      if (!text) continue
      for (const [cls, query] of Object.entries(opts)) {
        if (new RegExp(query).test(text)) {
          matches.push({node, cls, query}); break
        }
      }
    }
    matches.forEach(item=> spanTagText(item))
  })
}
const spanTagText = ({node, cls, query})=> {
  const parent = node.parentNode; if (!parent) return
  const text = node.textContent, rgx = new RegExp(query, 'g')
  let match, lastEnd = 0
  while (match = rgx.exec(text)) {
    const pre = text.slice(lastEnd, match.index)
    if (pre) parent.insertBefore(document.createTextNode(pre), node)
    lastEnd = rgx.lastIndex
    const span = document.createElement('span')
    Object.assign(span, {className: cls, textContent: match[0]})
    parent.insertBefore(span, node)
  }
  const suf = text.slice(lastEnd)
  if (suf) parent.insertBefore(document.createTextNode(suf), node)
  node.remove()
}