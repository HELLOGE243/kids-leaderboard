// The coach runs on the server, and the genres live in the client's source of
// truth. Rather than keeping two copies in step by hand, the server's copy is
// generated from the client's - run this after editing writingGenres.js.
//
//   node scripts/build-writing-briefs.mjs
import { writeFileSync } from 'node:fs'
import { WRITING_MODES, WRITING_FORMS, CRAFT_MOVES } from '../src/data/writingGenres.js'

const out = {
  generatedFrom: 'src/data/writingGenres.js',
  modes: WRITING_MODES.map(({ id, name, job, person, tense, beats, pitfalls }) =>
    ({ id, name, job, person, tense, beats, pitfalls })),
  forms: WRITING_FORMS.map(({ id, name, audience, register, furniture, features, pitfalls }) =>
    ({ id, name, audience, register, furniture, features, pitfalls })),
  moves: CRAFT_MOVES.map(({ id, name, child, band, modes }) => ({ id, name, child, band, modes })),
}
writeFileSync(new URL('../functions/writingBriefs.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`wrote functions/writingBriefs.json: ${out.modes.length} modes, ${out.forms.length} forms, ${out.moves.length} craft moves`)
