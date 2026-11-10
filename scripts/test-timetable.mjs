/**
 * The gate between the timetable form and site.config.json.
 *
 *   node scripts/test-timetable.mjs
 *
 * This is the only thing standing between a mistyped class time and the page
 * a parent books from, and almost everything it rejects would otherwise fail
 * silently rather than loudly: a class with no year groups simply never
 * appears, one that finishes before it starts prints as a negative lesson,
 * and two overlapping classes print as alternatives that cannot both be
 * taught. None of those throw. So each one is asserted here.
 *
 * Pure in, pure out - no server, no file, no clock.
 */
import { applySessions, yearChoices } from '../site/timetable.mjs'

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

const base = () => ({
  courses: [
    { slug: 'reading', name: 'Reading', years: 'Y1 - Y6', sessions: [], timesNote: '' },
    { slug: 'writing', name: 'Writing', years: 'Y3 - Y6', sessions: [], timesNote: '' },
  ],
})
const row = (over = {}) => ({ day: 2, start: '19:00', end: '21:00', years: [5], capacity: 8, ...over })
const one = (r) => ({ reading: { sessions: [].concat(r), note: '' } })

// --- what it accepts ------------------------------------------------------
{
  const cfg = base()
  const out = applySessions(cfg, one(row()))
  ok('a good class saves', out.ok, out.error)
  eq('it counts what it saved', out.saved, 1)
  eq('the class is written out whole', cfg.courses[0].sessions, [
    { id: 'reading-tue-1900', years: [5], day: 2, start: '19:00', end: '21:00',
      capacity: 8, enrolled: null, price: null, pay: '' },
  ])
}
{
  // How many are actually in the class. Blank has to survive as blank: a
  // class nobody has joined yet and a class whose roll was never typed in
  // are different things, and only one of them should say so on the page.
  const cfg = base()
  const out = applySessions(cfg, one(row({ enrolled: '6' })))
  ok('a roll saves', out.ok, out.error)
  eq('and is kept as a number', cfg.courses[0].sessions[0].enrolled, 6)
}
{
  const cfg = base()
  applySessions(cfg, one(row({ enrolled: '' })))
  eq('a blank roll stays blank', cfg.courses[0].sessions[0].enrolled, null)
}
{
  // Nobody enrolled yet is a real answer, not a missing one.
  const cfg = base()
  const out = applySessions(cfg, one(row({ enrolled: '0' })))
  ok('nought is allowed', out.ok, out.error)
  eq('and is kept', cfg.courses[0].sessions[0].enrolled, 0)
}
{
  const cfg = base()
  const out = applySessions(cfg, one(row({ enrolled: '-2' })))
  ok('a negative roll is refused', !out.ok, 'it saved')
}
{
  const cfg = base()
  const out = applySessions(cfg, one(row({ enrolled: 'lots' })))
  ok('a roll that is not a number is refused', !out.ok, 'it saved')
}
{
  // An all-or-nothing save: the bad row must not leave the good one behind.
  const cfg = base()
  const before = JSON.stringify(cfg.courses[0].sessions)
  applySessions(cfg, one([row(), row({ start: '09:00', end: '10:00', enrolled: '500' })]))
  eq('a bad roll rolls the whole course back',
    JSON.stringify(cfg.courses[0].sessions), before)
}
// --- the price, and where it is paid --------------------------------------
{
  // A price set on the class beats the subject's; a blank one defers to it,
  // so the usual case needs nothing typed twice.
  const cfg = base()
  const out = applySessions(cfg, one(row({ price: '820' })))
  ok('a class price saves', out.ok, out.error)
  eq('and is kept as a number', cfg.courses[0].sessions[0].price, 820)
}
{
  const cfg = base()
  applySessions(cfg, one(row({ price: '' })))
  eq('a blank price defers to the subject', cfg.courses[0].sessions[0].price, null)
}
{
  const cfg = base()
  const out = applySessions(cfg, one(row({ price: '-5' })))
  ok('a negative price is refused', !out.ok, 'it saved')
}
{
  // A free class is a real thing - a first lesson, a make-up - and is not
  // the same as a class whose price was never set.
  const cfg = base()
  const out = applySessions(cfg, one(row({ price: '0' })))
  ok('a free class is allowed', out.ok, out.error)
  eq('and stays nought, not blank', cfg.courses[0].sessions[0].price, 0)
}
{
  const cfg = base()
  const link = 'https://buy.stripe.com/test_abc123'
  const out = applySessions(cfg, one(row({ pay: '  ' + link + '  ' })))
  ok('a Stripe payment link saves', out.ok, out.error)
  eq('and is trimmed', cfg.courses[0].sessions[0].pay, link)
}
{
  const cfg = base()
  applySessions(cfg, one(row({ pay: '' })))
  eq('no link is an empty string, not a missing field',
    cfg.courses[0].sessions[0].pay, '')
}
// A payment button is the one control on this site where being sent to the
// wrong place costs a parent money, so every near miss is refused by name.
// Each of these would look right at a glance in the admin screen.
for (const [what, url] of [
  ['a link to somewhere else', 'https://example.com/pay'],
  ['a lookalike host', 'https://buy.stripe.com.evil.test/x'],
  ['a subdomain of the real host', 'https://evil.buy.stripe.com/x'],
  ['plain http', 'http://buy.stripe.com/abc'],
  ['a Stripe page that is not a payment link', 'https://dashboard.stripe.com/abc'],
  ['something that is not a URL at all', 'buy.stripe.com/abc'],
  ['a javascript: URL', 'javascript:alert(1)'],
]) {
  const cfg = base()
  const out = applySessions(cfg, one(row({ pay: url })))
  ok(`${what} is refused`, !out.ok, `it saved: ${url}`)
}
{
  // Stable, so a class reused next term lands on the id its basket entries
  // and any teacher's edits already point at.
  const a = base(); applySessions(a, one(row()))
  const b = base(); applySessions(b, one(row()))
  eq('the same slot always gets the same id',
    a.courses[0].sessions[0].id, b.courses[0].sessions[0].id)
}
{
  const cfg = base()
  applySessions(cfg, one([row({ day: 7, start: '13:45', end: '15:45' }), row({ day: 2 })]))
  eq('classes are stored Monday first, then by time',
    cfg.courses[0].sessions.map((s) => `${s.day} ${s.start}`), ['2 19:00', '7 13:45'])
}
{
  const cfg = base()
  applySessions(cfg, one(row({ years: [6, 3, 3, 1] })))
  eq('year groups are sorted and de-duplicated', cfg.courses[0].sessions[0].years, [1, 3, 6])
}
{
  const cfg = base()
  applySessions(cfg, one(row({ capacity: '' })))
  eq('a blank size falls back to the eight the site promises',
    cfg.courses[0].sessions[0].capacity, 8)
}
{
  // Two classes at the same hour in one subject are an error; the same hour
  // on different days is an ordinary timetable.
  const cfg = base()
  const out = applySessions(cfg, one([row({ day: 2 }), row({ day: 3 })]))
  ok('the same time on different days is fine', out.ok, out.error)
}
{
  const cfg = base()
  const out = applySessions(cfg, one([
    row({ day: 2, start: '19:00', end: '21:00' }),
    row({ day: 2, start: '21:00', end: '22:00' }),
  ]))
  ok('back to back is not an overlap', out.ok, out.error)
}
{
  const cfg = base()
  applySessions(cfg, { reading: { sessions: [], note: '  Ask for the calendar  ' } })
  eq('a note instead of times is kept, trimmed',
    cfg.courses[0].timesNote, 'Ask for the calendar')
  eq('and the class list is emptied', cfg.courses[0].sessions, [])
}
{
  // Two classes that genuinely run at the same hour on the same night, in
  // different rooms, are a real thing - they just need distinct ids.
  const cfg = base()
  applySessions(cfg, one([row({ day: 2, years: [3] }), row({ day: 2, start: '19:30', end: '21:30' })]))
  const ids = cfg.courses[0].sessions.map((s) => s.id)
  eq('ids stay unique', new Set(ids).size, ids.length)
}

// --- what it refuses ------------------------------------------------------
const refuses = (name, payload, expect) => {
  const cfg = base()
  const out = applySessions(cfg, payload)
  ok(name, !out.ok && String(out.error).toLowerCase().includes(expect),
    `got ${JSON.stringify(out)}`)
}

refuses('a class with no day', one(row({ day: 0 })), 'day of the week')
refuses('a day off the end of the week', one(row({ day: 8 })), 'day of the week')
refuses('a start that is not a time', one(row({ start: '7pm' })), 'not a start time')
refuses('a 25th hour', one(row({ start: '25:00' })), 'not a start time')
refuses('a finish that is not a time', one(row({ end: '' })), 'not a finish time')
refuses('a class that ends before it starts', one(row({ start: '19:00', end: '18:00' })), 'not after')
refuses('a class of no length', one(row({ start: '19:00', end: '19:00' })), 'not after')
refuses('a class open to nobody', one(row({ years: [] })), 'not open to any year')
refuses('a year group that is not a year', one(row({ years: ['five'] })), 'not open to any year')
refuses('a class of nought', one(row({ capacity: 0 })), 'not a class size')
refuses('a class of half a child', one(row({ capacity: 2.5 })), 'not a class size')
refuses('two classes at the same hour',
  one([row({ day: 2, start: '19:00', end: '21:00' }), row({ day: 2, start: '20:00', end: '22:00' })]),
  'overlap')
refuses('a course that does not exist', { nonsense: { sessions: [] } }, 'no course called')
refuses('a course with no list at all', { reading: {} }, 'no list of classes')
refuses('a note that is not text', { reading: { sessions: [], note: 7 } }, 'not text')
refuses('nothing at all', null, 'nothing to save')
refuses('a list where an object belongs', [], 'nothing to save')

// --- all or nothing -------------------------------------------------------
{
  // One bad row in the second course must not leave the first one saved:
  // a half-written timetable is worse than an unchanged one, because nobody
  // can tell by looking which half took.
  const cfg = base()
  const out = applySessions(cfg, {
    reading: { sessions: [row()], note: '' },
    writing: { sessions: [row({ end: '18:00' })], note: '' },
  })
  ok('a bad row in one course is refused', !out.ok)
  eq('and the good course is left untouched', cfg.courses[0].sessions, [])
}

// --- the year groups the form offers --------------------------------------
{
  eq('the form offers Years 1 to 6 by default', yearChoices(base()), [1, 2, 3, 4, 5, 6])
  const odd = base()
  odd.courses[0].sessions = [{ years: [8] }]
  eq('a year already in use is still offered', yearChoices(odd), [1, 2, 3, 4, 5, 6, 8])

  // The public courses page builds a tab per year in `yearsOffered`. If the
  // form did not offer the same years, a Year 7 tab could never be given a
  // Year 7 class - the tab would be permanently empty and nobody could see
  // why from the admin screen.
  const high = base()
  high.yearsOffered = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  eq('every year the school teaches is offered',
    yearChoices(high), [1, 2, 3, 4, 5, 6, 7, 8, 9])

  // And it has to survive the round trip, not just appear in the form.
  const cfg = base()
  cfg.yearsOffered = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const out = applySessions(cfg, one(row({ years: [9] })))
  ok('a Year 9 class saves', out.ok, out.error)
  eq('and keeps its year', cfg.courses[0].sessions[0].years, [9])
}

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
