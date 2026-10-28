/**
 * A local editor for the public site.
 *
 *   node site/edit.mjs        then open http://127.0.0.1:8080
 *
 * Browse the site as a visitor would. Every piece of text that comes from
 * site.config.json is outlined on hover; click it and type. Save, and the
 * value is written back to the config and all three builds are regenerated.
 *
 * The point is that the config stays the single source of truth. Nothing is
 * edited in the HTML, because the HTML is a build artifact and would be
 * overwritten by the next build. What you edit is the value, by the path the
 * builder tagged it with.
 *
 * It binds to the loopback address only and writes to exactly one file. It is
 * a tool for the person sitting at this machine, not a CMS, and there is no
 * authentication because there is no one else who can reach it.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, normalize, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, 'editing')
const configPath = join(here, 'site.config.json')
const PORT = Number(process.env.PORT) || 8080

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

// --------------------------------------------------------------- the config
const readConfig = () => JSON.parse(readFileSync(configPath, 'utf8'))

// `advantages.items.2.page.0` -> walk, then set the leaf. Every step must
// already exist: the editor can only change values that were rendered from
// the config, so a path that does not resolve is a bug or a tampered request,
// and in both cases the right answer is to refuse rather than to create keys.
function setPath(obj, path, value) {
  const parts = String(path).split('.')
  let node = obj
  for (const part of parts.slice(0, -1)) {
    if (node == null || !Object.prototype.hasOwnProperty.call(node, part)) return false
    node = node[part]
  }
  const last = parts[parts.length - 1]
  if (node == null || !Object.prototype.hasOwnProperty.call(node, last)) return false
  if (typeof node[last] !== 'string') return false
  node[last] = value
  return true
}

function rebuild() {
  const out = []
  for (const args of [[], ['--preview'], ['--edit']]) {
    out.push(execFileSync(process.execPath, [join(here, 'build.mjs'), ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  }
  return out.join('')
}

// ------------------------------------------------------------- the injection
// Added to every page the editor serves, and to no build that is deployed.
const CLIENT = `
<style>
  [data-edit] { outline: 1px dashed rgba(240,168,29,.55); outline-offset: 3px; cursor: text; border-radius: 3px; }
  [data-edit]:hover { outline: 2px solid #f0a81d; background: rgba(240,168,29,.10); }
  [data-edit]:focus { outline: 2px solid #1d6ef0; background: rgba(29,110,240,.07); }
  [data-edit].ed-dirty { background: rgba(29,110,240,.12); }
  #ed-bar {
    position: fixed; inset: auto 0 0 0; z-index: 99999;
    display: flex; align-items: center; gap: 14px;
    padding: 10px 16px; background: #14213d; color: #fff;
    font: 600 14px/1.4 ui-sans-serif, system-ui, sans-serif;
    box-shadow: 0 -4px 20px rgba(0,0,0,.28);
  }
  #ed-bar button {
    font: inherit; padding: 8px 16px; border: 0; border-radius: 7px;
    cursor: pointer; background: #f0a81d; color: #1a1205;
  }
  #ed-bar button:disabled { opacity: .4; cursor: default; }
  #ed-bar .ed-ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  #ed-count { margin-right: auto; font-weight: 500; }
  #ed-note { font-weight: 500; opacity: .85; }
  body { padding-bottom: 60px; }
</style>
<div id="ed-bar">
  <span id="ed-count">Click any outlined text to edit it</span>
  <span id="ed-note"></span>
  <button class="ed-ghost" id="ed-revert" disabled>Discard</button>
  <button id="ed-save" disabled>Save and rebuild</button>
</div>
<script>
(function () {
  var dirty = Object.create(null)
  var countEl = document.getElementById('ed-count')
  var noteEl = document.getElementById('ed-note')
  var saveEl = document.getElementById('ed-save')
  var revertEl = document.getElementById('ed-revert')

  function render() {
    var n = Object.keys(dirty).length
    countEl.textContent = n
      ? n + (n === 1 ? ' change not saved' : ' changes not saved')
      : 'Click any outlined text to edit it'
    saveEl.disabled = revertEl.disabled = !n
  }

  // **bold** survives a round trip: the page renders it as <strong>, so it has
  // to be turned back into asterisks before it goes into the config, or the
  // markup would be lost the first time anybody touched that line.
  function toSource(el) {
    var html = el.innerHTML
      .replace(/<strong[^>]*>(.*?)<\\/strong>/gi, '**$1**')
      .replace(/<br\\s*\\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
    var d = document.createElement('textarea')
    d.innerHTML = html
    return d.value.replace(/\\s+/g, ' ').trim()
  }

  document.querySelectorAll('[data-edit]').forEach(function (el) {
    var original = toSource(el)
    el.setAttribute('contenteditable', 'plaintext-only')
    el.setAttribute('spellcheck', 'true')
    // A link that is being edited must not navigate on click.
    el.addEventListener('click', function (ev) {
      if (el.tagName === 'A' || el.closest('a')) ev.preventDefault()
    })
    el.addEventListener('input', function () {
      var now = toSource(el)
      if (now === original) { delete dirty[el.dataset.edit]; el.classList.remove('ed-dirty') }
      else { dirty[el.dataset.edit] = now; el.classList.add('ed-dirty') }
      render()
    })
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); el.blur() }
      if (ev.key === 'Escape') { el.textContent = original; el.dispatchEvent(new Event('input')) }
    })
  })

  revertEl.addEventListener('click', function () { location.reload() })

  saveEl.addEventListener('click', function () {
    saveEl.disabled = true
    noteEl.textContent = 'Saving\\u2026'
    fetch('/__save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dirty),
    }).then(function (r) { return r.json() }).then(function (res) {
      if (!res.ok) { noteEl.textContent = 'Failed: ' + res.error; saveEl.disabled = false; return }
      noteEl.textContent = 'Saved ' + res.saved + ', rebuilt. Reloading\\u2026'
      setTimeout(function () { location.reload() }, 500)
    }).catch(function (e) {
      noteEl.textContent = 'Failed: ' + e.message
      saveEl.disabled = false
    })
  })

  window.addEventListener('beforeunload', function (ev) {
    if (Object.keys(dirty).length) { ev.preventDefault(); ev.returnValue = '' }
  })

  document.addEventListener('keydown', function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') { ev.preventDefault(); if (!saveEl.disabled) saveEl.click() }
  })

  render()
})()
</script>
`

// -------------------------------------------------------------------- server
function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__save') {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 512 * 1024) { req.destroy(); }
    })
    req.on('end', () => {
      try {
        const changes = JSON.parse(raw)
        const cfg = readConfig()
        const rejected = []
        let saved = 0
        for (const [path, value] of Object.entries(changes)) {
          if (typeof value !== 'string') { rejected.push(path); continue }
          if (setPath(cfg, path, value)) saved++
          else rejected.push(path)
        }
        if (rejected.length) {
          return send(res, 400, JSON.stringify({
            ok: false, error: `not a text value in the config: ${rejected.join(', ')}`,
          }), TYPES['.json'])
        }
        // The previous config is kept beside it. One stray paste into the
        // wrong field should not cost the afternoon's writing.
        copyFileSync(configPath, configPath + '.bak')
        writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n')
        const log = rebuild()
        console.log(`saved ${saved} value(s)`)
        for (const line of log.split('\n')) if (line.trim()) console.log('  ' + line.trim())
        send(res, 200, JSON.stringify({ ok: true, saved }), TYPES['.json'])
      } catch (err) {
        send(res, 500, JSON.stringify({ ok: false, error: String(err.message || err) }), TYPES['.json'])
      }
    })
    return
  }

  // Everything else is a static read out of site/editing.
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let file = normalize(join(root, url))
  if (!file.startsWith(root)) return send(res, 403, 'no')
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) {
    return send(res, 404, `<!doctype html><meta charset="utf-8">`
      + `<body style="font:16px system-ui;padding:40px">`
      + `<h1>Not in this build</h1>`
      + `<p>${url} is not generated right now. The bookshop and testimonies pages`
      + ` only exist once their entries are filled in.</p>`
      + `<p><a href="/">Back to the front page</a></p>`, TYPES['.html'])
  }
  const type = TYPES[extname(file)] || 'application/octet-stream'
  let body = readFileSync(file)
  if (extname(file) === '.html') {
    body = body.toString('utf8').replace('</body>', CLIENT + '</body>')
  }
  send(res, 200, body, type)
})

rebuild()
server.listen(PORT, '127.0.0.1', () => {
  console.log(`editor on http://127.0.0.1:${PORT}`)
  console.log(`editing ${configPath}`)
  console.log('click any outlined text, then Save and rebuild (or Ctrl+S)')
})
