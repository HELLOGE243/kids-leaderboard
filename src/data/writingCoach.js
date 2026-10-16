import { authedFetch } from './auth.js'

/**
 * Asking the writing coach for a turn.
 *
 * The browser sends what the child is writing and which task it is; the server
 * decides what to ask Claude. Nothing here builds a prompt - a prompt built in
 * the browser is a prompt a child can rewrite, and this one sits in front of
 * primary school students all term.
 *
 * Never throws: a coach that cannot be reached must not take the writing down
 * with it. A failed turn returns null and the child writes on.
 *
 * @param {object} args
 * @param {'brainstorm'|'evaluate'|'suggest'} args.action
 * @param {object} args.question the guided-writing question
 * @param {string} args.draft what they have written, as HTML
 * @param {object} args.session turns so far, so the coach does not repeat itself
 * @param {{id: string, year: number}} args.student
 * @returns {Promise<object|null>} the coach's turn
 */
export async function askWritingCoach({ action, question, draft, session, student }) {
  try {
    const res = await authedFetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        draft: String(draft || '').slice(0, 20000),
        modeId: question.modeId || 'short-story',
        formId: question.formId || 'plain',
        task: String(question.prompt || '').slice(0, 2000),
        year: Number(student?.year) || Number(question.yearLevel) || 5,
        // What has already been said, so the next turn moves on rather than
        // repeating the same note in different words.
        said: (session?.turns || []).slice(-3).map((t) => ({
          glow: t.glow || '', grow: t.grow || '', missing: t.missing || '',
        })),
        takenCards: (session?.cardsTaken || []).map((c) => c.text).slice(-6),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) {
      console.warn('writing coach:', data?.error || res.status)
      return {
        id: `err-${Date.now()}`,
        kind: action === 'evaluate' ? 'evaluate' : 'note',
        text: data?.error || 'I could not read your writing just then. Keep going — try me again in a moment.',
      }
    }
    return data.turn
  } catch (e) {
    console.warn('writing coach unreachable:', e)
    return {
      id: `err-${Date.now()}`,
      kind: 'note',
      text: 'I cannot reach my notes right now. Keep writing — your work is saved.',
    }
  }
}
