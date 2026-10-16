/**
 * What a piece of writing is, in two parts.
 *
 * A genre here is not one thing but two that compose: the MODE - what the
 * writing does, and so what shape it takes - and the FORM - where it appears
 * and who reads it, and so how it sounds and what furniture it carries.
 * "Persuasive" and "letter to the editor" are different questions, and a
 * child writing a persuasive letter to an editor needs both answered.
 *
 * Five modes and ten forms give fifty assignments without fifty genres being
 * written out. The coach composes a brief from one of each, and from the craft
 * moves that suit them.
 *
 * Everything here is a first draft for a teacher to correct: these are the
 * conventions as commonly taught in Australian primary and lower secondary
 * classrooms, Year 3 to Year 8, not scripture.
 */

/**
 * @typedef {object} Beat a stage the piece should pass through
 * @property {string} id
 * @property {string} name what the child sees on the spine
 * @property {string} lookFor how the coach decides whether it is present
 */

export const WRITING_MODES = [
  {
    id: 'short-story',
    family: 'narrative',
    name: 'Short story',
    job: 'Tell an invented story in which somebody wants something and something gets in the way.',
    person: 'first or third',
    tense: 'past',
    beats: [
      { id: 'orientation', name: 'Opening', lookFor: 'who it is about, where and when, dropped in while something is happening' },
      { id: 'complication', name: 'Problem', lookFor: 'the thing that goes wrong or gets in the way' },
      { id: 'rising', name: 'It gets harder', lookFor: 'at least one attempt that fails or costs something' },
      { id: 'climax', name: 'Turning point', lookFor: 'the moment it is decided, shown rather than summarised' },
      { id: 'resolution', name: 'Ending', lookFor: 'what is different now, including inside the character' },
    ],
    pitfalls: [
      'Starting with waking up and getting dressed',
      'Telling the whole plot in the first paragraph',
      'Ending with "and then I woke up and it was all a dream"',
      'Everything working first try, so nothing is at stake',
    ],
  },
  {
    id: 'personal-recount',
    family: 'narrative',
    name: 'Personal recount',
    job: 'Retell something that really happened to you, and say why it mattered.',
    person: 'first',
    tense: 'past',
    beats: [
      { id: 'orientation', name: 'Setting the scene', lookFor: 'who was there, where, when' },
      { id: 'events', name: 'What happened', lookFor: 'events in order, the important one slowed down' },
      { id: 'turn', name: 'The moment', lookFor: 'the bit that is the reason for telling it' },
      { id: 'reflection', name: 'Why it mattered', lookFor: 'what you thought, felt, or understood afterwards' },
    ],
    pitfalls: [
      'A list of everything that happened, all at the same speed',
      '"and then... and then... and then"',
      'No sign of why this day is worth telling anyone about',
    ],
  },
  {
    id: 'description',
    family: 'narrative',
    name: 'Description',
    job: 'Put a place, person or moment in front of the reader so clearly they could draw it.',
    person: 'any',
    tense: 'present or past',
    beats: [
      { id: 'wide', name: 'The whole picture', lookFor: 'where we are, in a line or two' },
      { id: 'close', name: 'Close up', lookFor: 'two or three specific details, not general ones' },
      { id: 'senses', name: 'More than seeing', lookFor: 'sound, smell, touch or temperature' },
      { id: 'feeling', name: 'The feeling of it', lookFor: 'the mood the details add up to' },
    ],
    pitfalls: [
      'Adjective stacking: "the big, old, dark, scary, creepy house"',
      'Naming the feeling instead of showing what causes it',
      'Only what can be seen',
    ],
  },
  {
    id: 'persuasive-essay',
    family: 'persuasive',
    name: 'Persuasive essay or speech',
    job: 'Argue one position and bring the reader round to it.',
    person: 'first or third',
    tense: 'present',
    beats: [
      { id: 'position', name: 'Your position', lookFor: 'what you think, said plainly, early' },
      { id: 'reason1', name: 'Reason with evidence', lookFor: 'a reason backed by an example, fact or story' },
      { id: 'reason2', name: 'Second reason', lookFor: 'a different reason, not the same one again' },
      { id: 'counter', name: 'The other side', lookFor: 'what someone who disagrees would say' },
      { id: 'rebuttal', name: 'Your answer to it', lookFor: 'why that does not change your position' },
      { id: 'call', name: 'What should happen', lookFor: 'what you want the reader to do or think now' },
    ],
    pitfalls: [
      'Saying the same reason three times in different words',
      'Opinion with nothing underneath it',
      'Pretending nobody could disagree',
      'SHOUTING and exclamation marks instead of evidence',
    ],
  },
  {
    id: 'discussion-essay',
    family: 'persuasive',
    name: 'Discussion essay',
    job: 'Weigh both sides fairly, then say where you land and why.',
    person: 'third mostly',
    tense: 'present',
    beats: [
      { id: 'issue', name: 'The question', lookFor: 'what is being argued about, and why it matters' },
      { id: 'for', name: 'One side', lookFor: 'the strongest argument for, with support' },
      { id: 'against', name: 'The other side', lookFor: 'the strongest argument against, put fairly' },
      { id: 'weigh', name: 'Weighing up', lookFor: 'which argument is stronger and why' },
      { id: 'position', name: 'Where you land', lookFor: 'your own view, earned by what came before' },
    ],
    pitfalls: [
      'Making one side deliberately weak so the other wins',
      'Never landing anywhere',
      'Two separate essays stapled together with no weighing',
    ],
  },
]

export const WRITING_FORMS = [
  {
    id: 'plain',
    name: 'No particular form',
    audience: 'your teacher',
    register: 'standard written English',
    furniture: [],
    features: [],
    pitfalls: [],
  },
  {
    id: 'advice-sheet',
    name: 'Advice sheet',
    audience: 'someone about to face what you have faced',
    register: 'warm, direct, speaking to "you"',
    furniture: ['A title that says who it is for', 'Headings or numbered tips'],
    features: ['Imperative verbs: try, take, remember', 'Short paragraphs', 'One idea per tip'],
    pitfalls: ['Advice so general it helps nobody', 'Forgetting to say why each tip works'],
  },
  {
    id: 'informative-guide',
    name: 'Informative guide',
    audience: 'a reader who knows nothing about this yet',
    register: 'clear, neutral, patient',
    furniture: ['Title', 'Subheadings', 'Sometimes a list'],
    features: ['Defines its terms', 'General statements supported by examples', 'Present tense'],
    pitfalls: ['Assuming the reader already knows', 'Opinion smuggled in as fact'],
  },
  {
    id: 'school-report',
    name: 'School report',
    audience: 'teachers, and the people who read reports',
    register: 'formal, measured, impersonal',
    furniture: ['Title', 'Sections with headings', 'Sometimes a recommendation at the end'],
    features: ['Third person', 'Evidence before conclusion', 'Cautious wording: suggests, appears, indicates'],
    pitfalls: ['Slang', 'Sweeping claims with no evidence'],
  },
  {
    id: 'newsletter-article',
    name: 'Newsletter article',
    audience: 'families and students at your school',
    register: 'friendly but tidy',
    furniture: ['Headline', 'Sometimes a byline'],
    features: ['Who, what, where, when early', 'Quotes from people involved', 'Ends looking forward'],
    pitfalls: ['Burying what happened under six lines of throat-clearing'],
  },
  {
    id: 'newspaper-article',
    name: 'Newspaper article',
    audience: 'the general public, skimming',
    register: 'factual, brisk, third person',
    furniture: ['Headline', 'Byline', 'Short paragraphs'],
    features: [
      'The whole story in the first sentence, then detail in falling order of importance',
      'Direct quotes with who said them',
      'Attributed facts: according to, said',
    ],
    pitfalls: ['The writer’s own opinion', 'Saving the big news for the end'],
  },
  {
    id: 'letter-editor',
    name: 'Letter to the editor',
    audience: 'the paper, and everyone who reads it',
    register: 'formal, controlled, pointed',
    furniture: ['Dear Editor,', 'Sign-off with your name and suburb'],
    features: ['Names the article or issue it answers', 'One clear argument', 'Usually short'],
    pitfalls: ['Rudeness instead of argument', 'Three arguments where one would land'],
  },
  {
    id: 'email-authority',
    name: 'Email to an authority',
    audience: 'someone with the power to change it',
    register: 'polite, formal, specific',
    furniture: ['Subject line', 'Dear [name or title],', 'Yours sincerely / faithfully'],
    features: ['Says who you are and why you are writing in the first lines', 'Asks for one specific thing'],
    pitfalls: ['Never actually asking for anything', 'Text-message tone'],
  },
  {
    id: 'diary-entry',
    name: 'Diary entry',
    audience: 'yourself, later',
    register: 'private, honest, unguarded',
    furniture: ['Date', 'Often "Dear Diary"'],
    features: ['First person, past tense for events, present for feelings', 'Thinking on the page', 'Questions you cannot answer yet'],
    pitfalls: ['Writing it as though a stranger will mark it', 'Events with no feelings attached'],
  },
  {
    id: 'review',
    name: 'Review',
    audience: 'someone deciding whether to bother',
    register: 'personal but fair',
    furniture: ['Title naming what is reviewed', 'Sometimes a rating'],
    features: ['What it is, briefly and without spoiling it', 'What worked and what did not, with examples', 'A recommendation, and who for'],
    pitfalls: ['Retelling the whole plot', '"It was good" with no evidence'],
  },
  {
    id: 'letter-to-self',
    name: 'Letter to yourself (time capsule)',
    audience: 'you, years from now',
    register: 'intimate, curious, a little funny',
    furniture: ['Date', 'Dear future me,', 'Sign-off from your present self'],
    features: ['What life is like right now, in detail', 'Questions for the older you', 'Predictions worth checking'],
    pitfalls: ['Only facts, no voice', 'Nothing specific enough to be worth reading later'],
  },
]

/**
 * Techniques, named after the writers who are known for them.
 *
 * The name is a label a child can carry - "a Morpurgo opening" - not an
 * instruction to imitate anybody. Imitation at this age produces borrowed
 * vocabulary a child cannot steer; a named move produces a thing they can
 * practise and recognise. The examples are written here rather than quoted,
 * so nothing in the product belongs to anybody else.
 */
export const CRAFT_MOVES = [
  { id: 'in-medias-res', name: 'Start in the middle', after: 'Morpurgo', band: 'all', modes: ['short-story', 'personal-recount'],
    child: 'Begin while something is already happening, then explain afterwards.',
    example: 'The rope was already slipping when I remembered I could not swim.' },
  { id: 'show-not-tell', name: 'Show it, do not say it', after: null, band: 'all', modes: ['short-story', 'personal-recount', 'description'],
    child: 'Instead of naming the feeling, show what the body does.',
    example: 'Not "I was nervous" but "I read the same line four times and still did not know what it said."' },
  { id: 'one-telling-detail', name: 'One telling detail', after: 'Chekhov', band: 'upper', modes: ['description', 'short-story', 'personal-recount'],
    child: 'One exact detail beats five vague ones.',
    example: 'The chipped mug with the faded dog on it, not "an old cup".' },
  { id: 'invented-words', name: 'Invented words', after: 'Dahl', band: 'lower', modes: ['short-story', 'description'],
    child: 'Make up a word when no real one fits - build it from sounds that feel right.',
    example: 'The floorboards gave a long, grumbly squitch.' },
  { id: 'cliffhanger', name: 'Cliffhanger', after: 'Blackman', band: 'all', modes: ['short-story'],
    child: 'End a paragraph on the edge, so the reader has to go on.',
    example: 'I turned the handle. It was already unlocked.' },
  { id: 'dialogue-reveals', name: 'Dialogue that reveals', after: 'Wilson', band: 'all', modes: ['short-story', 'personal-recount'],
    child: 'Let what someone says show what they are like, without you explaining it.',
    example: '"Fine," she said, folding my jumper for the third time. "That is completely fine."' },
  { id: 'sentence-rhythm', name: 'Long, long, short', after: null, band: 'upper', modes: ['short-story', 'description', 'persuasive-essay'],
    child: 'Two longer sentences, then a very short one. The short one lands.',
    example: 'We waited. We counted the cars going past, and the ones coming back, and the ones that never came back at all. Nobody came.' },
  { id: 'rule-of-three', name: 'Rule of three', after: null, band: 'all', modes: ['persuasive-essay', 'discussion-essay', 'description'],
    child: 'Three examples or three words together sound complete.',
    example: 'It is cheaper, it is faster, and it is already built.' },
  { id: 'plain-words', name: 'Plain words win', after: 'Orwell', band: 'upper', modes: ['persuasive-essay', 'discussion-essay'],
    child: 'Never use a long word where a short one does the job.',
    example: '"Use" beats "utilise". Every time.' },
  { id: 'concession', name: 'Give something away', after: null, band: 'upper', modes: ['persuasive-essay', 'discussion-essay'],
    child: 'Admit the other side has a point, then show why yours still stands. It makes you sound fair.',
    example: 'It is true that it would cost money at first. It is also true that we pay more every year we wait.' },
  { id: 'rhetorical-question', name: 'Ask the reader', after: null, band: 'lower', modes: ['persuasive-essay'],
    child: 'A question the reader answers in their head, on your side.',
    example: 'Would you want to eat that every day for a year?' },
  { id: 'anecdote-open', name: 'Open with a story', after: null, band: 'all', modes: ['persuasive-essay', 'discussion-essay'],
    child: 'Start an argument with one small true story, then widen out.',
    example: 'Last Tuesday, forty of us ate lunch standing up. Here is why that matters.' },
  { id: 'callback', name: 'Call back to the start', after: null, band: 'upper', modes: ['short-story', 'personal-recount', 'persuasive-essay'],
    child: 'End by touching something from your opening, changed.',
    example: 'Open with the unlocked door; close with her locking it behind them.' },
  { id: 'zoom', name: 'Wide, then close', after: null, band: 'lower', modes: ['description'],
    child: 'Show the whole place, then one small thing in it.',
    example: 'The hall held four hundred people. On the front row, one empty chair.' },
  { id: 'time-slow', name: 'Slow the important bit', after: null, band: 'all', modes: ['personal-recount', 'short-story'],
    child: 'Spend the most words on the few seconds that matter most.',
    example: 'Three hours of the trip in one line; the moment the glass broke in five.' },
  { id: 'sensory-sound', name: 'What could you hear?', after: null, band: 'lower', modes: ['description', 'personal-recount'],
    child: 'Add one sound. Most writing forgets sound entirely.',
    example: 'Somewhere behind the fence, a sprinkler ticked round and round.' },
  { id: 'specific-numbers', name: 'Real numbers', after: null, band: 'upper', modes: ['persuasive-essay', 'discussion-essay', 'newspaper-article'],
    child: 'A number is harder to argue with than "lots".',
    example: 'Not "heaps of students" but "two hundred and six of us".' },
  { id: 'direct-address', name: 'Talk to the reader', after: null, band: 'all', modes: ['persuasive-essay'],
    child: 'Say "you" and mean the person reading it.',
    example: 'You walk past that corner every morning.' },
  { id: 'understatement', name: 'Say less than you mean', after: null, band: 'upper', modes: ['short-story', 'personal-recount', 'review'],
    child: 'Playing it down can hit harder than playing it up.',
    example: 'The car was upside down. It had not been a good morning.' },
  { id: 'signposts', name: 'Signpost words', after: null, band: 'lower', modes: ['persuasive-essay', 'discussion-essay'],
    child: 'Small words that tell the reader where they are: firstly, on the other hand, in the end.',
    example: 'Firstly, it is safer. On the other hand, it costs more. In the end, safety wins.' },
  { id: 'fair-other-side', name: 'Put the other side fairly', after: null, band: 'lower', modes: ['discussion-essay'],
    child: 'Write the other side as if you believed it. A weak version fools nobody.',
    example: 'People who disagree are not being silly - they are worried about the cost.' },
  { id: 'because-chain', name: 'Because, and so', after: null, band: 'lower', modes: ['persuasive-essay', 'discussion-essay'],
    child: 'Say what you think, then because, then and so. Three links make an argument.',
    example: 'We need more bins, because the ones we have overflow by lunch, and so rubbish ends up on the oval.' },
  { id: 'comparison', name: 'Compare it to something', after: null, band: 'lower', modes: ['description', 'short-story', 'discussion-essay'],
    child: 'Compare the thing to something the reader already knows.',
    example: 'The corridor smelled like the inside of a pencil case.' },
  { id: 'last-line-turn', name: 'Turn on the last line', after: null, band: 'upper', modes: ['short-story', 'description', 'diary-entry'],
    child: 'Save one small surprise or shift of meaning for the final sentence.',
    example: 'She had been waving at the person behind me.' },
]

/** @returns {object|null} */
export const modeById = (id) => WRITING_MODES.find((m) => m.id === id) || null
/** @returns {object|null} */
export const formById = (id) => WRITING_FORMS.find((f) => f.id === id) || null

/**
 * One brief, built from a mode and a form.
 *
 * This is what the coach is told the child is writing, and what "what is
 * missing" is checked against.
 *
 * @param {string} modeId
 * @param {string} formId
 * @returns {{title: string, job: string, beats: Beat[], conventions: string[], pitfalls: string[], person: string, tense: string}|null}
 */
export function composeBrief(modeId, formId) {
  const mode = modeById(modeId)
  if (!mode) return null
  const form = formById(formId) || formById('plain')
  return {
    modeId: mode.id,
    formId: form.id,
    title: form.id === 'plain' ? mode.name : `${mode.name} · ${form.name}`,
    job: mode.job,
    person: mode.person,
    tense: mode.tense,
    beats: mode.beats,
    audience: form.audience,
    register: form.register,
    conventions: [...(form.furniture || []), ...(form.features || [])],
    pitfalls: [...(mode.pitfalls || []), ...(form.pitfalls || [])],
  }
}

/**
 * The craft moves worth offering for this brief and year level.
 * @param {string} modeId
 * @param {number} year 3 to 8
 */
export function craftMovesFor(modeId, year = 5) {
  const band = year <= 5 ? 'lower' : 'upper'
  return CRAFT_MOVES.filter((m) => (m.modes.includes(modeId))
    && (m.band === 'all' || m.band === band))
}
