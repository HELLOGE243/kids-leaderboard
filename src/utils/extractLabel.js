/**
 * What an extract tab should read.
 *
 * Imported questions store the tab title as the bare letter CleverSpace used
 * ("A", "B"), and new questions start as "Tab A" - both read as a stray label
 * above a passage. Those become "Extract A"; a real title ("The Battery Hen")
 * or one already written as "Extract B" is kept exactly as it is.
 */
export function extractTabLabel(title, index) {
  const clean = String(title || '').trim()
  if (!clean) return `Extract ${String.fromCharCode(65 + index)}`
  if (/^extract\b/i.test(clean)) return clean
  const bare = /^(?:tab|text|section)?\s*[A-Ha-h0-9][).:]?$/i.test(clean)
  return bare ? `Extract ${String.fromCharCode(65 + index)}` : clean
}
