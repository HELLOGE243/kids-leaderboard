/**
 * The class basket, tested without a browser.
 *
 *   node scripts/test-cart.mjs
 *
 * site/cart.js is the only part of the public site that holds state, and the
 * one piece of it nothing else checks is the email it composes: the page can
 * be driven in a real browser right up to the last line, but `location.href`
 * is unforgeable, so the finished message cannot be read back from there.
 * That message is the whole product - it is what a parent actually sends and
 * what the school acts on - so it is driven here instead, through the real
 * file, over the real generated timetable.
 *
 * The DOM is stubbed only as far as the enrolment page uses it. A stub that
 * grew past that would start testing itself.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const site = join(root, 'site')

let pass = 0
const fails = []
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`pass  ${name}`) } else {
    fails.push(name)
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}
function eq(name, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want)
  ok(name, same, same ? '' : `got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

// ----------------------------------------------------------- the DOM stub
class Elem {
  constructor(tag) {
    this.tagName = tag
    this.children = []
    this._text = null
    this.hidden = false
    this.className = ''
    this.value = ''
    this.attrs = {}
    this.handlers = {}
    const self = this
    this.classList = {
      toggle(c, on) { self.attrs['class:' + c] = !!on },
      add(c) { self.attrs['class:' + c] = true },
      remove(c) { self.attrs['class:' + c] = false },
    }
  }
  get textContent() {
    if (this._text !== null) return this._text
    return this.children.map((c) => c.textContent).join('')
  }
  set textContent(v) { this._text = String(v); this.children = [] }
  get firstChild() { return this.children[0] || null }
  appendChild(c) { this._text = null; this.children.push(c); return c }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null }
  addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn) }
  querySelector() { return null }
  querySelectorAll() { return [] }
}

const nodes = {}
const node = (id) => (nodes[id] = nodes[id] || new Elem('div'))

const store = {}
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
}

const body = new Elem('body')
body.setAttribute('data-page', 'enrol')

const document = {
  body,
  createElement: (tag) => new Elem(tag),
  getElementById: (id) => node(id),
  querySelector: (sel) => {
    if (sel === '.enrol-sent') return node('sent')
    if (sel === '.cart-bar') return null
    if (sel === '.year-note') return null
    return null
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
}

// ------------------------------------------------- the real file, real data
const ctx = vm.createContext({ document, localStorage, console })
ctx.window = ctx
ctx.location = { href: '' }

// The timetable the build actually emitted, not a hand-written copy of it.
vm.runInContext(readFileSync(join(site, 'dist', 'catalogue.js'), 'utf8'), ctx)

// Which classes to put in the basket is decided from the timetable that was
// just read in, not written down here. The timetable is edited from the admin
// screen between terms, and a test that named Tuesday's 7pm Thinking Skills
// class failed the first time somebody moved it to 7:30 - a true statement
// about the timetable reported as a bug in the basket. What is asserted below
// is the basket's own work: who is grouped with whom, in what order, at what
// subtotal, in the message a parent actually sends.
const courses = ctx.window.AVANT_CATALOGUE.courses
const offered = []
for (const c of courses) for (const sn of c.sessions || []) offered.push({ c, s: sn })

// One child with two classes and one with a single class, so grouping,
// ordering within a group, and two different subtotals are all in play.
const byYear = new Map()
for (const rec of offered) {
  for (const y of rec.s.years || []) {
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y).push(rec)
  }
}
const ascending = [...byYear.keys()].sort((a, b) => a - b)
const pairYear = ascending.find((y) => byYear.get(y).length >= 2)
const soloYear = ascending.find((y) => y !== pairYear)
ok('the timetable can fill a basket for two children',
  pairYear != null && soloYear != null,
  `years with classes: ${JSON.stringify(ascending)}`)
if (pairYear == null || soloYear == null) {
  console.log('\nThe emitted timetable has too few classes to test the basket.')
  process.exit(1)
}

const pair = byYear.get(pairYear).slice(0, 2)
const solo = byYear.get(soloYear).slice(0, 1)
// The names belong to the children, so they follow age, not pick order.
const younger = Math.min(pairYear, soloYear)
const elder = Math.max(pairYear, soloYear)
const NAME = { [younger]: 'Sam', [elder]: 'Mia' }

store['avant.cart.v1'] = JSON.stringify({
  v: 1,
  items: [
    // Deliberately out of timetable order: adding them already sorted would
    // let a basket that never sorts pass.
    { s: pair[1].s.id, y: pairYear },
    { s: solo[0].s.id, y: soloYear },
    { s: pair[0].s.id, y: pairYear },
  ],
  names: { ...NAME },
})

vm.runInContext(readFileSync(join(site, 'cart.js'), 'utf8'), ctx)

// The one piece of formatting worth repeating here: a four-figure subtotal
// has to carry its comma, which is the whole reason this is a string and not
// a number.
const money = (n) => '$' + Number(n).toLocaleString('en-AU')
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const inOrder = (recs) => [...recs].sort((a, b) =>
  (a.s.day - b.s.day) || (mins(a.s.start) - mins(b.s.start)))
const forYear = (y) => inOrder(y === pairYear ? pair : solo)
const sum = (recs) => recs.reduce((n, r) => n + (r.c.price || 0), 0)
const years = [younger, elder]
const grandTotal = sum(pair) + sum(solo)

// ------------------------------------------------------------- what it drew
{
  const app = node('enrol-app')
  // The last child is the running total, which belongs to no year.
  const groups = app.children.slice(0, -1)
  eq('one group per school year', groups.length, 2)
  // Ascending, so the eldest is not buried under the youngest.
  ok('years ascend', groups[0].textContent.indexOf('Year ' + years[0]) === 0,
    groups[0].textContent.slice(0, 40))
  ok('the second group is the elder child',
    groups[1].textContent.indexOf('Year ' + years[1]) === 0,
    groups[1].textContent.slice(0, 40))
  // The child with two classes gets both of them, and a subtotal that adds
  // them up - the one number on the screen a parent is likely to check.
  const twoClasses = groups[years.indexOf(pairYear)]
  for (const r of pair) {
    ok(`${r.c.name} at ${r.s.label} is drawn`,
      twoClasses.textContent.includes(r.s.label))
  }
  ok('and their subtotal adds up',
    twoClasses.textContent.includes(money(sum(pair)) + ' per term'),
    twoClasses.textContent)
  ok('a name already given is filled in',
    groups[1].children[0].children[1].children[1].value === NAME[years[1]])

  const totals = app.children[app.children.length - 1]
  eq('the total is the sum of every class',
    totals.textContent, 'Total' + money(grandTotal) + ' per term')
}

// -------------------------------------------------------- what it composes
{
  node('enrol-parent').value = 'Robert Chen'
  node('enrol-email').value = 'parent@example.com'
  node('enrol-phone').value = '0400 000 000'
  node('enrol-start').value = 'Term 1'
  node('enrol-message').value = 'Mia has done Year 4 maths already.'

  const form = node('enrol-form')
  ok('the form has a submit handler', !!(form.handlers.submit || []).length)
  form.handlers.submit[0]({ preventDefault() {} })

  const url = ctx.location.href
  ok('it opens a mail client', url.indexOf('mailto:') === 0)
  ok('it is addressed to the school', url.indexOf('hello.avantacademy@gmail.com') > 0)

  const body = decodeURIComponent(url.split('&body=')[1] || '')
  const subject = decodeURIComponent((url.split('?subject=')[1] || '').split('&')[0])
  eq('the subject counts the classes', subject, 'Enrolment enquiry - 3 classes')

  // The message is the deliverable. Every line of it is checked, because a
  // quietly dropped child's name or subtotal is not visible to anyone until
  // the school replies to the wrong thing. The class lines quote the build's
  // own `label`: the point is that the basket repeats the time the timetable
  // published rather than formatting a second, disagreeing version of it.
  const want = ['Enrolment enquiry', '']
  for (const y of years) {
    const recs = forYear(y)
    want.push(`${NAME[y]} (Year ${y})`)
    for (const r of recs) {
      want.push(`  - ${r.c.name} - ${r.s.label} - ${money(r.c.price)} per term`)
    }
    want.push(`  Subtotal: ${money(sum(recs))} per term`, '')
  }
  want.push(`Total: ${money(grandTotal)} per term`, '',
    'Parent: Robert Chen',
    'Email: parent@example.com',
    'Phone: 0400 000 000',
    'Preferred start: Term 1',
    '',
    'Mia has done Year 4 maths already.')

  eq('the message reads as a person would write it', body.split('\n'), want)

  ok('the parent is told their mail app was opened', node('sent').hidden === false)
}

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
