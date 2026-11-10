/**
 * The class timetable, as a person edits it.
 *
 * The rest of the site editor works on single strings: click the words, type
 * new words, save. A class cannot be edited that way - it is a day, a start,
 * an end, a set of year groups and a size, and four of those five have to be
 * right together or the page prints a class nobody can attend. So the
 * timetable gets a screen of its own, and this module owns both halves of it:
 * the form, and the only gate between that form and site.config.json.
 *
 * Everything is validated here rather than in the browser. The form stops the
 * obvious mistakes early because that is kinder, but a form is a convenience
 * and never the guard - the config is what the build trusts, so this is where
 * a bad value has to be refused.
 *
 * Ids are derived from the slot rather than stored, so the same class always
 * lands on the same id and a reused one keeps whatever is attached to it.
 * Move a class to another night and the id changes, which is correct: a
 * basket holding the old one drops it rather than quietly booking a parent
 * into a time that no longer exists.
 */

const DAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const atMinute = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

/**
 * Every year group the form offers.
 *
 * Years 1 to 6 always, plus every year the school says it teaches
 * (`yearsOffered`, the same list the courses page builds its tabs from), plus
 * anything already saved against a class. The middle one matters: without it
 * the form could not tick Year 7, 8 or 9 even though the public page has a
 * tab for each - so a class that exists could never be entered.
 */
export function yearChoices(cfg) {
  const set = new Set([1, 2, 3, 4, 5, 6])
  for (const y of cfg.yearsOffered || []) set.add(Number(y))
  for (const c of cfg.courses || []) {
    for (const s of c.sessions || []) for (const y of s.years || []) set.add(Number(y))
  }
  return [...set].filter((y) => Number.isInteger(y) && y > 0).sort((a, b) => a - b)
}

/**
 * Validate one course's classes and write them into the config.
 *
 * Mutates `cfg` only when every course in the payload passes, so a single bad
 * row cannot leave half a timetable saved.
 *
 * @returns {{ok: true, saved: number} | {ok: false, error: string}}
 */
export function applySessions(cfg, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'nothing to save' }
  }
  const bySlug = new Map((cfg.courses || []).map((c) => [c.slug, c]))
  const staged = []

  for (const [slug, body] of Object.entries(payload)) {
    const course = bySlug.get(slug)
    if (!course) return { ok: false, error: `there is no course called "${slug}"` }

    const rows = body && Array.isArray(body.sessions) ? body.sessions : null
    if (!rows) return { ok: false, error: `${course.name}: no list of classes` }
    if (body.note != null && typeof body.note !== 'string') {
      return { ok: false, error: `${course.name}: the note is not text` }
    }

    const used = new Set()
    const clean = []
    for (const r of rows) {
      const where = course.name
      const day = Number(r && r.day)
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        return { ok: false, error: `${where}: a class has no day of the week` }
      }
      const start = String(r.start || '')
      const end = String(r.end || '')
      if (!TIME.test(start)) return { ok: false, error: `${where}: "${start}" is not a start time` }
      if (!TIME.test(end)) return { ok: false, error: `${where}: "${end}" is not a finish time` }
      if (atMinute(end) <= atMinute(start)) {
        return {
          ok: false,
          error: `${where}: the ${DAY_LONG[day]} class finishes at ${end}, which is not after ${start}`,
        }
      }

      const years = [...new Set((Array.isArray(r.years) ? r.years : []).map(Number))]
        .filter((y) => Number.isInteger(y) && y >= 1 && y <= 12)
        .sort((a, b) => a - b)
      if (!years.length) {
        return {
          ok: false,
          error: `${where}: the ${DAY_LONG[day]} ${start} class is not open to any year group`,
        }
      }

      let capacity = null
      if (r.capacity !== '' && r.capacity != null) {
        capacity = Number(r.capacity)
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 99) {
          return { ok: false, error: `${where}: "${r.capacity}" is not a class size` }
        }
      }

      // How many are actually in the class. Zero is a real answer - a class
      // that has just opened has nobody in it yet - so this is left blank
      // rather than defaulted, and a blank one simply says nothing on the
      // page instead of claiming an enrolment of none.
      let enrolled = null
      if (r.enrolled !== '' && r.enrolled != null) {
        enrolled = Number(r.enrolled)
        if (!Number.isInteger(enrolled) || enrolled < 0 || enrolled > 99) {
          return { ok: false, error: `${where}: "${r.enrolled}" is not a number of students` }
        }
      }

      /* What this class costs, and where it is paid.
       *
       * Both are per class rather than per subject, because that is how the
       * school sets them: a price is decided when a class is created, and it
       * is the price of that class. A blank price falls back to the subject's
       * own, so nothing has to be typed twice for the usual case.
       *
       * The link is checked against Stripe's own payment-link host and
       * nothing else. A payment button is the one control on this site where
       * being sent to the wrong place costs a parent money, so a typo in the
       * admin screen must not be able to publish one - and an allowlist of
       * one host is the only check here that cannot be talked around. */
      let price = null
      if (r.price !== '' && r.price != null) {
        price = Number(r.price)
        if (!Number.isInteger(price) || price < 0 || price > 99999) {
          return { ok: false, error: `${where}: "${r.price}" is not a price` }
        }
      }

      let pay = ''
      if (r.pay != null && String(r.pay).trim() !== '') {
        pay = String(r.pay).trim()
        let u = null
        try { u = new URL(pay) } catch (e) { u = null }
        // Both halves matter. The host alone would let http:// through, and
        // a payment page served over http is one a parent's card details can
        // be read off in transit.
        if (!u || u.protocol !== 'https:' || u.host !== 'buy.stripe.com') {
          return {
            ok: false,
            error: `${where}: a payment link must be a https://buy.stripe.com/... `
              + `address (got "${pay}")`,
          }
        }
      }

      // Two classes in one subject at the same hour on the same night cannot
      // both be taught, and the page would print them as alternatives.
      for (const other of clean) {
        if (other.day === day
          && atMinute(other.start) < atMinute(end) && atMinute(start) < atMinute(other.end)) {
          return {
            ok: false,
            error: `${where}: two classes overlap on ${DAY_LONG[day]} `
              + `(${other.start}-${other.end} and ${start}-${end})`,
          }
        }
      }

      let id = `${slug}-${DAY_SHORT[day]}-${start.replace(':', '')}`
      if (used.has(id)) {
        let n = 2
        while (used.has(`${id}-${n}`)) n++
        id = `${id}-${n}`
      }
      used.add(id)
      clean.push({ id, years, day, start, end, capacity: capacity ?? 8, enrolled,
        price, pay })
    }

    clean.sort((a, b) => (a.day - b.day) || (atMinute(a.start) - atMinute(b.start)))
    staged.push({ course, sessions: clean, note: (body.note || '').trim() })
  }

  for (const { course, sessions, note } of staged) {
    course.sessions = sessions
    course.timesNote = note
  }
  return { ok: true, saved: staged.reduce((n, s) => n + s.sessions.length, 0) }
}

// ------------------------------------------------------------------- the form
function rowHtml(cfg, slug, s, i) {
  const years = yearChoices(cfg)
  const on = new Set((s.years || []).map(Number))
  return `
  <tr class="tt-row">
    <td>
      <select class="tt-day" aria-label="Day">
        ${[1, 2, 3, 4, 5, 6, 7].map((d) =>
          `<option value="${d}"${Number(s.day) === d ? ' selected' : ''}>${DAY_LONG[d]}</option>`).join('')}
      </select>
    </td>
    <td><input class="tt-start" type="time" value="${esc(s.start || '')}" aria-label="Starts" required></td>
    <td><input class="tt-end" type="time" value="${esc(s.end || '')}" aria-label="Finishes" required></td>
    <td>
      <div class="tt-years">
        ${years.map((y) => `
        <label class="tt-year"><input type="checkbox" value="${y}"${on.has(y) ? ' checked' : ''}><span>${y}</span></label>`).join('')}
      </div>
    </td>
    <td><input class="tt-cap" type="number" min="1" max="99" value="${esc(s.capacity ?? 8)}" aria-label="Class size"></td>
    <td><input class="tt-enrolled" type="number" min="0" max="99" placeholder="—"
               value="${s.enrolled == null ? '' : esc(s.enrolled)}" aria-label="Students enrolled"></td>
    <td><input class="tt-price" type="number" min="0" max="99999" placeholder="subject"
               value="${s.price == null ? '' : esc(s.price)}" aria-label="Price per term"></td>
    <td><input class="tt-pay" type="url" placeholder="https://buy.stripe.com/..."
               value="${esc(s.pay || '')}" aria-label="Stripe payment link"></td>
    <td><button type="button" class="tt-rm" aria-label="Remove this class">Remove</button></td>
  </tr>`
}

/** The whole timetable screen, as one self-contained page. */
export function adminPage(cfg) {
  const years = yearChoices(cfg)
  const blank = { day: 2, start: '', end: '', years: [], capacity: 8, enrolled: null,
    price: null, pay: '' }

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Class timetable</title>
<style>
  :root { --ink:#14213d; --soft:#4a5568; --line:#e2ded4; --gold:#f0a81d; --go:#15803d; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.6 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
         color:var(--ink); background:#f6f4ef; padding-bottom:84px; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 28px 20px; }
  h1 { margin:0 0 6px; font-size:1.7rem; letter-spacing:-0.02em; }
  .lede { color:var(--soft); margin:0 0 26px; max-width:70ch; }
  .course { background:#fff; border:1px solid var(--line); border-radius:12px;
            padding:18px 20px; margin-bottom:18px; }
  .course h2 { margin:0 0 2px; font-size:1.12rem; }
  .course .meta { margin:0 0 12px; color:var(--soft); font-size:0.9rem; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:0.74rem; text-transform:uppercase;
       letter-spacing:0.06em; color:var(--soft); padding:0 8px 6px 0; font-weight:700; }
  td { padding:5px 8px 5px 0; vertical-align:middle; }
  select, input[type=time], input[type=number], input[type=text] {
    font:inherit; padding:7px 9px; border:1px solid var(--line);
    border-radius:7px; background:#fff; color:inherit; }
  input[type=number] { width:4.5rem; }
  .tt-years { display:flex; gap:3px; flex-wrap:wrap; }
  .tt-year { display:inline-flex; align-items:center; }
  .tt-year input { position:absolute; opacity:0; width:0; height:0; }
  .tt-year span { display:inline-block; min-width:30px; text-align:center;
    padding:6px 2px; border:1px solid var(--line); border-radius:7px;
    font-size:0.88rem; font-weight:700; cursor:pointer; background:#fff; }
  .tt-year input:checked + span { background:var(--ink); color:#fff; border-color:var(--ink); }
  .tt-year input:focus-visible + span { outline:2px solid var(--gold); outline-offset:2px; }
  .tt-rm, .tt-add { font:inherit; font-size:0.88rem; cursor:pointer; border-radius:7px; }
  .tt-rm { background:none; border:0; color:var(--soft); text-decoration:underline; padding:4px; }
  .tt-rm:hover { color:#9b2c2c; }
  .tt-add { margin-top:10px; background:#fff; border:1px solid var(--ink);
            color:var(--ink); font-weight:700; padding:7px 14px; }
  .tt-note { display:block; margin-top:12px; font-size:0.9rem; color:var(--soft); }
  .tt-note input { width:100%; margin-top:4px; }
  .tt-empty { color:var(--soft); font-size:0.92rem; margin:0; }
  #bar { position:fixed; inset:auto 0 0 0; display:flex; align-items:center; gap:14px;
         padding:12px 20px; background:var(--ink); color:#fff; font-weight:600;
         box-shadow:0 -4px 20px rgba(0,0,0,.28); }
  #bar #msg { margin-right:auto; font-weight:500; }
  #bar button, #bar a { font:inherit; font-weight:700; padding:9px 17px; border:0;
    border-radius:7px; cursor:pointer; background:var(--gold); color:#1a1205;
    text-decoration:none; }
  #bar a { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.5); }
  #bar button:disabled { opacity:.45; cursor:default; }
  .err { color:#ffd0c4; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Class timetable</h1>
  <p class="lede">The day, the time and the year groups each class is open to.
    Everything here goes on the Courses page and into the parent's basket, so a
    class listed for Years 1 to 6 is offered to all of them.
    Years ${years[0]} to ${years[years.length - 1]} are available.</p>

  ${(cfg.courses || []).map((c) => `
  <section class="course" data-slug="${esc(c.slug)}">
    <h2>${esc(c.name)}</h2>
    <p class="meta">${esc(c.years || '')}${c.price ? ` &middot; ${esc(c.price)}` : ''}</p>
    <table>
      <thead><tr><th>Day</th><th>Starts</th><th>Finishes</th><th>Year groups</th><th>Size</th><th>Enrolled</th><th>Price</th><th>Stripe payment link</th><th></th></tr></thead>
      <tbody class="tt-body">${(c.sessions || []).map((s, i) => rowHtml(cfg, c.slug, s, i)).join('')}</tbody>
    </table>
    ${(c.sessions || []).length ? '' : '<p class="tt-empty">No fixed class times.</p>'}
    <button type="button" class="tt-add">Add a class</button>
    <label class="tt-note">Instead of times, say this
      <input type="text" class="tt-note-input" value="${esc(c.timesNote || '')}"
             placeholder="e.g. Scheduled through the term - ask for the current calendar">
    </label>
  </section>`).join('')}
</div>

<div id="bar">
  <span id="msg">Change anything, then save.</span>
  <a href="/courses/">View the Courses page</a>
  <button id="save">Save and rebuild</button>
</div>

<template id="tt-blank"><table><tbody>${rowHtml(cfg, '', blank, 0)}</tbody></table></template>

<script>
(function () {
  var msg = document.getElementById('msg')
  var saveBtn = document.getElementById('save')
  var dirty = false

  function touched() {
    dirty = true
    msg.className = ''
    msg.textContent = 'Not saved yet.'
  }
  document.addEventListener('input', touched)
  document.addEventListener('change', touched)

  document.addEventListener('click', function (e) {
    if (e.target.closest('.tt-add')) {
      var section = e.target.closest('.course')
      var tpl = document.getElementById('tt-blank')
      var row = tpl.content.querySelector('.tt-row').cloneNode(true)
      section.querySelector('.tt-body').appendChild(row)
      var empty = section.querySelector('.tt-empty')
      if (empty) empty.remove()
      row.querySelector('.tt-start').focus()
      touched()
    }
    if (e.target.closest('.tt-rm')) {
      e.target.closest('.tt-row').remove()
      touched()
    }
  })

  function collect() {
    var out = {}
    document.querySelectorAll('.course').forEach(function (section) {
      var rows = [].map.call(section.querySelectorAll('.tt-row'), function (tr) {
        return {
          day: Number(tr.querySelector('.tt-day').value),
          start: tr.querySelector('.tt-start').value,
          end: tr.querySelector('.tt-end').value,
          capacity: tr.querySelector('.tt-cap').value,
          enrolled: tr.querySelector('.tt-enrolled').value,
          price: tr.querySelector('.tt-price').value,
          pay: tr.querySelector('.tt-pay').value,
          years: [].map.call(tr.querySelectorAll('.tt-years input:checked'),
            function (b) { return Number(b.value) })
        }
      })
      out[section.getAttribute('data-slug')] = {
        sessions: rows,
        note: section.querySelector('.tt-note-input').value
      }
    })
    return out
  }

  saveBtn.addEventListener('click', function () {
    saveBtn.disabled = true
    msg.className = ''
    msg.textContent = 'Saving\\u2026'
    fetch('/__timetable/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(collect())
    }).then(function (r) { return r.json() }).then(function (res) {
      saveBtn.disabled = false
      if (!res.ok) { msg.className = 'err'; msg.textContent = res.error; return }
      dirty = false
      msg.textContent = 'Saved ' + res.saved + ' class times, site rebuilt. Reloading\\u2026'
      setTimeout(function () { location.reload() }, 600)
    }).catch(function (err) {
      saveBtn.disabled = false
      msg.className = 'err'
      msg.textContent = String(err.message || err)
    })
  })

  window.addEventListener('beforeunload', function (ev) {
    if (dirty) { ev.preventDefault(); ev.returnValue = '' }
  })
})()
</script>
</body>
</html>
`
}
