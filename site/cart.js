/* AVANT public site - choosing class times and building an enrolment basket.
 *
 * The site is static and has no server, so this does the whole job in the
 * browser: it remembers what was chosen in localStorage and hands the finished
 * basket to the parent's own mail client, exactly as the contact form does.
 * Nothing is collected here, which is also the honest answer to give a parent
 * about what happens to their child's details.
 *
 * The basket is grouped by school year rather than by line, because the year
 * chip the parent already pressed tells us which child a class is for without
 * interrupting them to ask for a name. A name is attached once, on the
 * enrolment page, and only to a group that has something in it.
 *
 * Everything degrades: with JavaScript off, every class time is still printed
 * in the HTML and the enquiry button on each subject still works.
 */
(function () {
  'use strict'

  var KEY = 'avant.cart.v1'
  var YEAR_KEY = 'avant.year.v1'
  var C = window.AVANT_CATALOGUE || { courses: [], email: '' }

  // sessionId -> { s: session, c: course }. Built once; every lookup below
  // goes through it, so a stale basket pointing at a class that no longer
  // runs is dropped on load rather than rendered as a blank line.
  var SESSION = {}
  C.courses.forEach(function (c) {
    (c.sessions || []).forEach(function (s) { SESSION[s.id] = { s: s, c: c } })
  })

  // ------------------------------------------------------------- the basket
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (!v || !Array.isArray(v.items)) return { items: [], names: {} }
      return {
        items: v.items.filter(function (it) { return it && SESSION[it.s] && it.y }),
        names: (v.names && typeof v.names === 'object') ? v.names : {}
      }
    } catch (e) { return { items: [], names: {} } }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, items: state.items, names: state.names }))
    } catch (e) { /* private browsing: the basket just will not outlive the tab */ }
  }
  var state = load()

  function has(sid, year) {
    return state.items.some(function (it) { return it.s === sid && it.y === year })
  }
  function toggle(sid, year) {
    if (has(sid, year)) {
      state.items = state.items.filter(function (it) { return !(it.s === sid && it.y === year) })
    } else {
      state.items.push({ s: sid, y: year })
    }
    save()
  }
  function drop(sid, year) {
    state.items = state.items.filter(function (it) { return !(it.s === sid && it.y === year) })
    save()
  }
  /* What one class costs. The school sets a price per class when it creates
     one; a class that was never given its own falls back to the subject's,
     so the usual case needs nothing typed twice. Everything that prints or
     adds a price goes through here, so the tile, the basket, the total and
     the email can never quote three different numbers. */
  function priceOf(rec) {
    return rec.s.price == null ? (rec.c.price || 0) : rec.s.price
  }
  function total(items) {
    return (items || state.items).reduce(function (n, it) {
      return n + priceOf(SESSION[it.s])
    }, 0)
  }
  function money(n) { return '$' + Number(n).toLocaleString('en-AU') }
  function mins(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]) }

  /* Two classes at the same hour on the same day cannot both be attended, and
     a parent should be told at the moment they pick the second one rather
     than in a reply three days later. */
  function clashes(sid, year) {
    var a = SESSION[sid].s
    return state.items.filter(function (it) {
      if (it.y !== year || it.s === sid) return false
      var b = SESSION[it.s].s
      return b.day === a.day && mins(b.start) < mins(a.end) && mins(a.start) < mins(b.end)
    }).map(function (it) { return SESSION[it.s] })
  }

  /* Two times for the same subject and year is usually a misclick, but it is
     legitimately what a parent wants when they are asking which would suit -
     so it is pointed out, not prevented. */
  function doubles(sid, year) {
    var slug = SESSION[sid].c.slug
    return state.items.filter(function (it) {
      return it.y === year && it.s !== sid && SESSION[it.s].c.slug === slug
    }).map(function (it) { return SESSION[it.s] })
  }

  /* One child's classes, Monday first and then earliest start - the order the
     timetable is read in, rather than the order they happened to be clicked.
     The screen and the email both come through here: when only the screen
     sorted, the two disagreed, and a parent checking a confirmation against
     what they remembered sending had no way to tell which was right. */
  function sortedFor(year) {
    return state.items.filter(function (it) { return it.y === year })
      .sort(function (a, b) {
        var p = SESSION[a.s].s, q = SESSION[b.s].s
        return (p.day - q.day) || (mins(p.start) - mins(q.start))
      })
  }

  function yearsInBasket() {
    var seen = {}
    state.items.forEach(function (it) { seen[it.y] = true })
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b })
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  // -------------------------------------------------------- the courses page
  function initCourses() {
    var bar = document.querySelector('.cart-bar')
    var barText = bar && bar.querySelector('.cart-bar-text')
    var barList = bar && bar.querySelector('.cart-list')
    var barTotal = bar && bar.querySelector('.cart-total-n')
    var barToggle = bar && bar.querySelector('.cart-toggle')
    if (barToggle) {
      barToggle.addEventListener('click', function () {
        var open = bar.classList.toggle('is-open')
        barToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
        fitPage()
      })
    }
    var filterYear = 'all'

    // The years live on the tile now rather than on a block around it: the
    // page is grouped by day, so one Tuesday evening holds classes for
    // different year ranges side by side.
    var yearsOf = function (li) {
      return (li.getAttribute('data-years') || '')
        .split(',').map(Number).filter(function (n) { return n > 0 })
    }

    /* Which year a press means. Usually obvious: the parent has chosen a year
       at the top of the page, or the block covers only one. When neither is
       true - "All years" showing a block open to Years 2 to 6 - there is no
       honest default, so the row asks. Pressing a year chip once makes the
       question go away for the rest of the visit. */
    var activeYear = function (li) {
      if (filterYear !== 'all') return Number(filterYear)
      var ys = yearsOf(li)
      return ys.length === 1 ? ys[0] : null
    }
    var pickedYears = function (li) {
      var sid = li.getAttribute('data-session')
      var a = activeYear(li)
      var scope = a ? [a] : yearsOf(li)
      return state.items.filter(function (it) {
        return it.s === sid && scope.indexOf(it.y) !== -1
      }).map(function (it) { return it.y })
    }

    function closePickers(except) {
      var open = document.querySelectorAll('.session-years')
      for (var i = 0; i < open.length; i++) {
        if (open[i] !== except) {
          open[i].hidden = true
          // The tile widens to the full row while it is asking, so the year
          // chips sit on one line instead of wrapping inside a third of a
          // card. Putting it back is part of closing it.
          open[i].parentNode.classList.remove('is-asking')
        }
      }
    }

    function openPicker(li) {
      var box = li.querySelector('.session-years')
      if (!box) return
      if (!box.firstChild) {
        box.appendChild(el('span', 'session-years-label', 'Which year?'))
        yearsOf(li).forEach(function (y) {
          var b = el('button', 'session-year', 'Year ' + y)
          b.type = 'button'
          b.setAttribute('data-year', String(y))
          box.appendChild(b)
        })
      }
      closePickers(box)
      box.hidden = false
      li.classList.add('is-asking')
    }

    function paint(li) {
      var sid = li.getAttribute('data-session')
      var mine = pickedYears(li)
      var on = mine.length > 0
      var btn = li.querySelector('.session-pick')
      li.classList.toggle('is-picked', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
      // The label goes in its own element rather than over the button's
      // text: the button is the whole tile now, and its words are the day
      // and the time, which must survive being chosen.
      var state = li.querySelector('.session-state')
      // Under "All years" the tile has to say which child it was chosen for,
      // or a parent with two children cannot tell what they have done.
      state.textContent = !on ? ''
        : (activeYear(li) === null
            ? 'Selected · Year ' + mine.join(', ')
            : 'Selected')

      var warn = li.querySelector('.session-warn')
      var notes = []
      mine.forEach(function (y) {
        clashes(sid, y).forEach(function (o) {
          notes.push('Year ' + y + ': clashes with ' + o.c.name + ', ' + o.s.short + '.')
        })
        doubles(sid, y).forEach(function (o) {
          notes.push('Year ' + y + ': ' + o.s.short + ' is already chosen for this subject.')
        })
      })
      warn.textContent = notes.join(' ')
      warn.hidden = notes.length === 0
    }

    function paintAll() {
      var rows = document.querySelectorAll('.session')
      for (var i = 0; i < rows.length; i++) paint(rows[i])
      if (!bar) return
      var n = state.items.length
      bar.hidden = n === 0
      document.body.classList.toggle('has-basket', n > 0)
      if (n) drawBasket(); else fitPage()
    }

    /* The basket, itemised.
     *
     * A running total alone answers "how much" and nothing else: a parent
     * who has pressed eight tiles across four subjects cannot tell from one
     * number which eight, and the only way to find out was to leave the page
     * for the enrolment screen and come back. So every line is listed here,
     * with its own price and its own way out.
     *
     * Grouped by school year and sorted by day within the year, which is the
     * same order the enrolment page and the email use - a parent checking one
     * against another should never have to re-sort in their head.
     */
    function drawBasket() {
      var ys = yearsInBasket()
      var n = state.items.length
      barText.textContent = n + (n === 1 ? ' class' : ' classes')
        + ' for ' + (ys.length === 1 ? 'Year ' + ys[0] : ys.length + ' year groups')
        + ' · ' + money(total()) + ' per term'
      if (!barList) return
      barList.textContent = ''
      ys.forEach(function (y) {
        // With one child on screen the year is already in the summary line
        // above; repeating it over every row would be noise.
        if (ys.length > 1) barList.appendChild(el('li', 'cart-year', 'Year ' + y))
        sortedFor(y).forEach(function (it) {
          var rec = SESSION[it.s]
          var li = el('li', 'cart-item')
          var main = el('span', 'cart-item-main')
          main.appendChild(el('b', null, rec.c.name))
          main.appendChild(el('span', 'cart-item-when', rec.s.short))
          li.appendChild(main)
          li.appendChild(el('span', 'cart-item-price',
            priceOf(rec) ? money(priceOf(rec)) : '—'))
          var rm = el('button', 'cart-item-rm', '×')
          rm.type = 'button'
          // The × is a symbol, so the button has to say in words what it
          // takes out - there may be four rows that look alike but for the day.
          rm.setAttribute('aria-label',
            'Remove ' + rec.c.name + ', ' + rec.s.label + ', Year ' + y)
          rm.setAttribute('data-rm-session', it.s)
          rm.setAttribute('data-rm-year', String(y))
          li.appendChild(rm)
          barList.appendChild(li)
        })
      })
      if (barTotal) barTotal.textContent = money(total()) + ' per term'
      fitPage()
    }

    /* As a bar across the foot the basket is as tall as its own contents, so
       the room the page leaves for it cannot be a number in the stylesheet:
       one class and four classes need different amounts, and getting it wrong
       hides the last card behind the thing the parent is reading it to fill.
       As a rail it takes a column instead, which the stylesheet can handle on
       its own - hence the reset rather than a second measurement. */
    var wide = window.matchMedia('(min-width: 1440px)')
    function fitPage() {
      if (!bar || bar.hidden || wide.matches) {
        document.body.style.paddingBottom = ''
        return
      }
      document.body.style.paddingBottom = (bar.offsetHeight + 16) + 'px'
    }
    window.addEventListener('resize', fitPage)

    document.addEventListener('click', function (e) {
      if (!e.target.closest) return

      // Taking a class out of the basket also has to un-press the tile it
      // came from, which is what paintAll does for every tile on the page.
      var rm = e.target.closest('.cart-item-rm')
      if (rm) {
        closePickers(null)
        drop(rm.getAttribute('data-rm-session'), Number(rm.getAttribute('data-rm-year')))
        paintAll()
        return
      }

      var chosen = e.target.closest('.session-year')
      if (chosen) {
        var row = chosen.closest('.session')
        toggle(row.getAttribute('data-session'), Number(chosen.getAttribute('data-year')))
        row.querySelector('.session-years').hidden = true
        row.classList.remove('is-asking')
        paintAll()
        return
      }

      var btn = e.target.closest('.session-pick')
      if (!btn) { closePickers(null); return }
      var li = btn.closest('.session')
      var sid = li.getAttribute('data-session')
      var y = activeYear(li)

      if (y === null) {
        var already = pickedYears(li)
        if (already.length) {
          already.forEach(function (yy) { drop(sid, yy) })
          paintAll()
        } else {
          openPicker(li)
        }
        return
      }
      closePickers(null)
      toggle(sid, y)
      paintAll()
    })

    // ---- the year filter
    // One choice at the top narrows every subject on the page at once, and is
    // remembered: a parent with a Year 5 child is not asked again on the way
    // back from the contact page.
    var note = document.querySelector('.year-note')
    var noteYear = note && note.querySelector('.year-note-year')
    var noteRest = note && note.querySelector('.year-note-rest')

    function applyYear(y) {
      filterYear = y
      closePickers(null)
      var chips = document.querySelectorAll('.year-chip')
      for (var i = 0; i < chips.length; i++) {
        chips[i].setAttribute('aria-pressed',
          chips[i].getAttribute('data-year-filter') === y ? 'true' : 'false')
      }
      // Hide the classes that do not take this year, then hide any day left
      // with nothing on it - an empty Thursday heading reads as a mistake.
      var days = document.querySelectorAll('.day')
      var total = 0
      for (var j = 0; j < days.length; j++) {
        var tiles = days[j].querySelectorAll('.session')
        var shown = 0
        for (var k = 0; k < tiles.length; k++) {
          var years = (tiles[k].getAttribute('data-years') || '').split(',')
          var vis = (y === 'all') || years.indexOf(y) !== -1
          tiles[k].hidden = !vis
          if (vis) shown++
        }
        days[j].hidden = shown === 0
        total += shown
      }
      // Under one year the range on every tile would say the same thing, so
      // it only earns its place in the all-years view.
      var week = document.querySelector('.week')
      if (week) week.classList.toggle('show-years', y === 'all')

      // The enquiry link beside it is written into the page, not built here,
      // so a year with nothing on is never a dead end.
      var none = document.querySelector('.week-none')
      if (none) {
        none.hidden = total > 0
        var noneText = none.querySelector('.week-none-text')
        if (noneText) {
          noneText.textContent = 'No Year ' + y + ' classes are on the timetable yet.'
        }
      }
      // The year is the headline, not a clause inside a sentence: it is the
      // one thing on screen that changes what every tile below means.
      if (note) {
        note.hidden = (y === 'all')
        if (noteYear) noteYear.textContent = 'Year ' + y
        if (noteRest) {
          noteRest.textContent = (total === 1 ? 'one' : total) + ' active '
            + (total === 1 ? 'class' : 'classes')
        }
      }
      try { localStorage.setItem(YEAR_KEY, y) } catch (e) {}
      paintAll()
    }

    var chips = document.querySelectorAll('.year-chip')
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        applyYear(this.getAttribute('data-year-filter'))
      })
    }
    var showAll = document.querySelector('.year-note-clear')
    if (showAll) showAll.addEventListener('click', function () { applyYear('all') })

    var remembered = 'all'
    try { remembered = localStorage.getItem(YEAR_KEY) || 'all' } catch (e) {}
    if (remembered !== 'all'
      && !document.querySelector('.year-chip[data-year-filter="' + remembered + '"]')) {
      remembered = 'all'
    }
    applyYear(remembered)

    // The front page links to /courses/#writing. A details element does not
    // open just because the fragment names it, so the link would land on a
    // closed heading and look broken.
    function openNamedSubject() {
      var id = (location.hash || '').replace(/^#/, '')
      if (!id) return
      var el = document.getElementById(id)
      if (el && el.tagName === 'DETAILS') {
        el.open = true
        el.scrollIntoView({ block: 'start' })
      }
    }
    openNamedSubject()
    window.addEventListener('hashchange', openNamedSubject)
  }

  // ---------------------------------------------------------- the enrol page
  function initEnrol() {
    var app = document.getElementById('enrol-app')
    if (!app) return
    var form = document.getElementById('enrol-form')

    function render() {
      app.textContent = ''
      var years = yearsInBasket()

      if (!years.length) {
        var empty = el('div', 'enrol-empty')
        empty.appendChild(el('p', null, 'You have not chosen any classes yet.'))
        var back = el('a', 'btn btn-go', 'Browse class times')
        back.href = '/courses/'
        empty.appendChild(back)
        app.appendChild(empty)
        if (form) form.hidden = true
        return
      }
      if (form) form.hidden = false

      years.forEach(function (y) {
        var picked = sortedFor(y)
        var group = el('section', 'enrol-group')

        var head = el('div', 'enrol-group-head')
        head.appendChild(el('h2', null, 'Year ' + y))
        var lab = el('label', 'enrol-name')
        lab.appendChild(el('span', null, 'Child’s name'))
        var input = el('input', 'input')
        input.type = 'text'
        input.value = state.names[y] || ''
        input.placeholder = 'First name'
        input.autocomplete = 'off'
        input.addEventListener('input', function () {
          state.names[y] = this.value
          save()
        })
        lab.appendChild(input)
        head.appendChild(lab)
        group.appendChild(head)

        var list = el('ul', 'enrol-lines')
        picked.forEach(function (it) {
          var rec = SESSION[it.s]
          var li = el('li', 'enrol-line')
          var main = el('div', 'enrol-line-main')
          main.appendChild(el('strong', null, rec.c.name))
          main.appendChild(el('span', 'enrol-line-when', rec.s.label))
          // The courses page warned about this when it was chosen; a basket
          // that then shows the two side by side without a word reads as
          // though the clash went away.
          var bad = clashes(it.s, it.y)
          if (bad.length) {
            main.appendChild(el('span', 'enrol-line-warn',
              'Clashes with ' + bad.map(function (o) { return o.c.name }).join(', ') + '.'))
          }
          li.appendChild(main)
          li.appendChild(el('span', 'enrol-line-price',
            priceOf(rec) ? money(priceOf(rec)) : '—'))
          var rm = el('button', 'enrol-remove', 'Remove')
          rm.type = 'button'
          rm.setAttribute('aria-label', 'Remove ' + rec.c.name + ', ' + rec.s.label)
          rm.addEventListener('click', function () { drop(it.s, it.y); render() })
          li.appendChild(rm)
          /* Pay, where the school has set a link for this class.
             One button per class rather than one for the basket: a Stripe
             payment link is tied to a single fixed price, so a basket of
             three classes is three payments. Each button therefore names the
             class it pays for and opens in its own tab, so a parent part way
             through does not lose the rest of the basket. Only classes with
             a link show one, and the rest still go by enquiry. */
          if (rec.s.pay) {
            var pay = el('a', 'btn btn-go btn-sm enrol-pay', 'Pay ' + money(priceOf(rec)))
            pay.href = rec.s.pay
            pay.target = '_blank'
            pay.rel = 'noopener'
            pay.setAttribute('aria-label',
              'Pay ' + money(priceOf(rec)) + ' for ' + rec.c.name + ', ' + rec.s.label
              + ' (opens Stripe in a new tab)')
            li.appendChild(pay)
          }
          list.appendChild(li)
        })
        group.appendChild(list)
        group.appendChild(el('p', 'enrol-subtotal', money(total(picked)) + ' per term'))
        app.appendChild(group)
      })

      var foot = el('p', 'enrol-total')
      foot.appendChild(el('span', null, 'Total'))
      foot.appendChild(el('strong', null, money(total()) + ' per term'))
      app.appendChild(foot)
    }

    // The basket becomes a written enquiry. Nothing is charged and no seat is
    // held: the reply confirms the place, which is how the school already
    // works and is the honest thing to show a parent.
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault()
        if (!state.items.length) return
        var v = function (id) {
          var n = document.getElementById(id)
          return n ? n.value.trim() : ''
        }

        var lines = ['Enrolment enquiry', '']
        yearsInBasket().forEach(function (y) {
          var picked = sortedFor(y)
          var who = state.names[y] ? state.names[y] + ' (Year ' + y + ')' : 'Year ' + y
          lines.push(who)
          picked.forEach(function (it) {
            var rec = SESSION[it.s]
            lines.push('  - ' + rec.c.name + ' - ' + rec.s.label
              + (priceOf(rec) ? ' - ' + money(priceOf(rec)) + ' per term' : ''))
          })
          lines.push('  Subtotal: ' + money(total(picked)) + ' per term')
          lines.push('')
        })
        lines.push('Total: ' + money(total()) + ' per term')
        lines.push('')
        lines.push('Parent: ' + v('enrol-parent'))
        lines.push('Email: ' + v('enrol-email'))
        if (v('enrol-phone')) lines.push('Phone: ' + v('enrol-phone'))
        if (v('enrol-start')) lines.push('Preferred start: ' + v('enrol-start'))
        if (v('enrol-message')) { lines.push(''); lines.push(v('enrol-message')) }

        var n = state.items.length
        var subject = 'Enrolment enquiry - ' + n + (n === 1 ? ' class' : ' classes')
        window.location.href = 'mailto:' + C.email
          + '?subject=' + encodeURIComponent(subject)
          + '&body=' + encodeURIComponent(lines.join('\n'))

        var sent = document.querySelector('.enrol-sent')
        if (sent) sent.hidden = false
      })
    }

    render()
  }

  var page = document.body.getAttribute('data-page')
  if (page === 'courses') initCourses()
  else if (page === 'enrol') initEnrol()
})();
