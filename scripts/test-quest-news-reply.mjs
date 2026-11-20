/**
 * Reading the news report out of a reply that searched the web first.
 *
 *   node scripts/test-quest-news-reply.mjs
 *
 * The news slot is the only part of the night that gives Claude a tool, and
 * that changes the shape of what comes back. A reply with no tools in it is
 * one text block. A reply that searched is text, then a tool call, then its
 * result, then more text - several times over - and the JSON we asked for is
 * in the LAST text block, behind a sentence or two of "I'll look that up".
 *
 * The job used to read the first text block. So it parsed the preamble, found
 * no report in it, and recorded "the news reply was not the JSON asked for" -
 * for eleven nights running, while the finished report sat further down the
 * very same reply. Both news slots died that way every night, and because the
 * paper bank only fills when a night succeeds, the fallback that was supposed
 * to cover a bad night had nothing in it either.
 *
 * Nothing here calls a model. The replies below are the shapes the API
 * actually returns, written out by hand.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const questJob = require('../functions/questJob.js')

let pass = 0
const fails = []
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`pass  ${name}`) } else {
    fails.push(name); console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}

// The report the model wrote, as the JSON the prompt asked for.
const REPORT = {
  headline: 'Scientists map a reef that had never been surveyed',
  paragraphs: [
    'A team of marine scientists has finished the first full survey of a reef off the coast of Western Australia.',
    'The reef had been recorded on charts for decades, but nobody had mapped what lived on it.',
    'The survey counted more than four hundred species, eleven of which the team could not identify.',
    'The work took three weeks and used a robot submarine that could stay down for nine hours at a time.',
    'The team said the next step was to work out whether any of the eleven are new to science.',
  ],
  sources: [
    'https://example.org/reef-survey',
    'https://example.net/marine-science-reef',
    'https://example.com/wa-reef-mapped',
  ],
}

/** A reply body as the API returns it, from a list of content blocks. */
const reply = (content, stop_reason = 'end_turn') =>
  ({ status: 200, body: JSON.stringify({ content, stop_reason }) })

const TEXT = (t) => ({ type: 'text', text: t })
const SEARCH_CALL = { type: 'server_tool_use', id: 'srvtoolu_01', name: 'web_search', input: { query: 'reef survey' } }
const SEARCH_RESULT = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_01',
  content: [{ type: 'web_search_result', url: 'https://example.org/reef-survey', title: 'Reef survey' }],
}

/** A job whose every model call returns the given content blocks. */
const jobReturning = (content, stopReason) => questJob.make({
  db: null,
  callClaude: async () => reply(content, stopReason),
})

const index = { keys: new Set(), chaptersByWork: {} }

// ---------------------------------------------------------------- the fix
{
  // What a searching reply really looks like: the JSON is last, and there is
  // chat in front of it.
  const job = jobReturning([
    TEXT("I'll search for a recent science story suitable for this age group."),
    SEARCH_CALL,
    SEARCH_RESULT,
    TEXT('Those sources agree on the numbers. Let me check one more.'),
    SEARCH_CALL,
    SEARCH_RESULT,
    TEXT(JSON.stringify(REPORT)),
  ])
  const { paper, tried } = await job.newsPiece('y6', index)
  ok('a report behind two searches is found', !!paper, tried.join('; '))
  ok('it is the headline the model wrote',
    paper && paper.title === REPORT.headline, paper && paper.title)
  ok('every paragraph survives',
    !!paper && REPORT.paragraphs.every((p) => paper.text.includes(p)))
  ok('the sources come with it',
    !!paper && paper.sources.length === 3 && paper.sources[0] === REPORT.sources[0])
}

// -------------------------------------------------- the exact failure seen
{
  // The preamble alone, with no JSON in it, is what the old code handed the
  // parser. If this ever passes a report again, the first-block bug is back.
  const job = jobReturning([
    TEXT("I'll search for a recent science story suitable for this age group."),
    SEARCH_CALL,
    SEARCH_RESULT,
    TEXT(JSON.stringify(REPORT)),
  ])
  const { paper, tried } = await job.newsPiece('y6', index)
  ok('the night no longer reports the JSON as missing',
    !!paper && !tried.includes('the news reply was not the JSON asked for'),
    tried.join('; '))
}

// ------------------------------------------- a preamble that looks like JSON
{
  // A sentence with braces in it used to be able to move the start of the
  // slice. Every opening bracket is tried in turn, so this still resolves.
  const job = jobReturning([
    TEXT('I considered {"topic": "volcanoes"} first, but settled on the reef.'),
    SEARCH_CALL,
    SEARCH_RESULT,
    TEXT(`Here is the report:\n\`\`\`json\n${JSON.stringify(REPORT)}\n\`\`\``),
  ])
  const { paper } = await job.newsPiece('y6', index)
  ok('a braced aside in the preamble does not win',
    !!paper && paper.title === REPORT.headline, paper && paper.title)
}

// ------------------------------------------------------- no regression
{
  // The ordinary case: one text block, no tools. Every other caller in the
  // job looks like this, so it has to keep working unchanged.
  const job = jobReturning([TEXT(JSON.stringify(REPORT))])
  const { paper } = await job.newsPiece('y6', index)
  ok('a plain single-block reply still parses', !!paper && paper.title === REPORT.headline)
}

// ------------------------------------------------------- the real refusals
{
  // A reply that genuinely holds no report must still be refused. The fix
  // must not turn "nothing came back" into a paper.
  const job = jobReturning([TEXT('I could not find a suitable story this week.'), SEARCH_CALL, SEARCH_RESULT])
  const { paper, tried } = await job.newsPiece('y6', index)
  ok('a reply with no report in it is still refused', !paper)
  ok('and still says the JSON was not there',
    tried.some((t) => t.startsWith('the news reply was not the JSON asked for')), tried.join('; '))
}

// -------------------------------------------------- a reply that ran out
{
  // The refusal has to say which of the two things went wrong. A reply cut
  // off at max_tokens is not a model that ignored the format - it is a model
  // that was writing the right thing and ran out of room, and the fix for one
  // is nothing like the fix for the other. Both news slots failed here for
  // eleven nights with a message that could not tell them apart.
  const half = JSON.stringify(REPORT).slice(0, 180)
  const job = jobReturning([TEXT('Searching.'), SEARCH_CALL, SEARCH_RESULT, TEXT(half)], 'max_tokens')
  const { paper, tried } = await job.newsPiece('y6', index)
  ok('a truncated report is refused', !paper)
  ok('and the refusal names the stop reason',
    tried.some((t) => t.includes('stopped: max_tokens')), tried.join('; '))
  ok('and shows the end of what did arrive',
    tried.some((t) => t.includes(half.slice(-30).replace(/\s+/g, ' '))), tried.join('; '))
}

{
  // A report nobody can check is not publishable, searched or not.
  const job = jobReturning([
    TEXT('Searching now.'),
    SEARCH_CALL,
    SEARCH_RESULT,
    TEXT(JSON.stringify({ ...REPORT, sources: [] })),
  ])
  const { paper, tried } = await job.newsPiece('y6', index)
  ok('a report citing nothing is still refused', !paper)
  ok('for citing nothing, not for the JSON',
    tried.includes('the news piece cited no sources'), tried.join('; '))
}

console.log(`\n${pass} pass, ${fails.length} fail`)
for (const f of fails) console.log(`  - ${f}`)
process.exit(fails.length ? 1 : 0)
