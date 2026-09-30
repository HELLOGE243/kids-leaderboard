/**
 * The offline dictionary behind the vocabulary bank.
 *
 * Princeton WordNet, cut down to one sense per word — the one the corpus says is
 * most used — and split by first letter, so looking a word up fetches a few
 * hundred kilobytes once rather than the whole language. No network round trip
 * per word, no cost, and the same answer every time.
 *
 * Its glosses are what a dictionary entry should be: "marked by precise
 * accordance with details", not a paragraph explaining what the word is for.
 *
 * Built by scripts/build-dictionary.mjs. WordNet 3.0 Copyright 2006 by
 * Princeton University; see public/dict/LICENCE.txt.
 */
const PART_NAMES = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' }

const shards = new Map()      // letter -> Promise<object>

function loadShard(letter) {
  if (!shards.has(letter)) {
    shards.set(letter, fetch(`/dict/${letter}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})))
  }
  return shards.get(letter)
}

/**
 * The forms a word might be stored under. A student saves "deteriorated" or
 * "abundantly"; the dictionary holds the stem.
 */
function candidates(word) {
  const w = word.toLowerCase().trim()
  const out = [w]
  const add = (x) => { if (x.length > 2 && !out.includes(x)) out.push(x) }
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`)
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s')) add(w.slice(0, -1))
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)) }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(`${w.slice(0, -3)}e`) }
  if (w.endsWith('ly')) add(w.slice(0, -2))
  if (w.endsWith('er')) add(w.slice(0, -2))
  if (w.endsWith('est')) add(w.slice(0, -3))
  if (w.endsWith('ness')) add(w.slice(0, -4))
  // A doubled final consonant before the ending: "stopped" -> "stop".
  if (/([a-z])\1(ed|ing)$/.test(w)) add(w.replace(/([a-z])\1(ed|ing)$/, '$1'))
  return out
}

/**
 * Looks a word up in the dictionary.
 * @returns {Promise<{word,definition,partOfSpeech,matched}|null>} null when the
 *   word is not in it, which is when the AI is worth asking.
 */
export async function lookUpWord(word) {
  const clean = String(word || '').toLowerCase().trim()
  if (!/^[a-z][a-z'-]*$/.test(clean)) return null
  const shard = await loadShard(clean[0])
  for (const form of candidates(clean)) {
    const entry = shard[form]
    if (entry) {
      const senses = [{ d: entry.d, p: entry.p }, ...(entry.alt || [])]
      return {
        word: clean,
        matched: form,
        definition: entry.d,
        partOfSpeech: PART_NAMES[entry.p] || entry.p || '',
        // Every sense the dictionary holds, best first. WordNet's order is not
        // always the sense a student needs, so the choice is offered on.
        senses: senses.map((s) => ({
          definition: s.d,
          partOfSpeech: PART_NAMES[s.p] || s.p || '',
        })),
      }
    }
  }
  return null
}

export default lookUpWord
