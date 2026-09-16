let ctx = null
let masterGain = null
let musicGain = null
let muted = false
let currentTrackId = null
let loopTimer = null
let activeNodes = []
let lastClickTime = 0

const R = 0
const C3=131,D3=147,E3=165,F3=175,G3=196,A3=220,B3=247
const C4=262,D4=294,E4=330,F4=349,G4=392,A4=440,B4=494
const C5=523,D5=587,E5=659,F5=698,G5=784,A5=880,B5=988
const C6=1047,D6=1175

export const MUSIC_TRACKS = [
  { id:'pixel-adventure', name:'Pixel Adventure', emoji:'\u{1F3F0}', price:300, bpm:130, mWave:'square', bWave:'triangle',
    melody:[[C5,.5],[E5,.5],[G5,.5],[C6,.5],[B5,.5],[G5,.5],[E5,.5],[R,.5],
            [F5,.5],[A5,.5],[C6,.5],[A5,.5],[G5,.5],[E5,.5],[C5,.5],[R,.5],
            [D5,.5],[F5,.5],[A5,.5],[D6,.5],[C6,.5],[A5,.5],[F5,.5],[R,.5],
            [E5,1],[G5,1],[C6,2]],
    bass:[[C3,4],[F3,4],[D3,4],[C3,4]] },
  { id:'neon-nights', name:'Neon Nights', emoji:'\u{1F303}', price:400, bpm:108, mWave:'sawtooth', bWave:'triangle',
    melody:[[A4,1],[R,.5],[C5,.5],[D5,1],[E5,1],
            [E5,1],[D5,.5],[C5,.5],[A4,1],[R,1],
            [A4,.5],[C5,.5],[E5,1],[D5,1],[C5,1],
            [A4,2],[R,2]],
    bass:[[A3,4],[F3,4],[G3,4],[A3,4]] },
  { id:'study-beats', name:'Study Beats', emoji:'\u{1F4D6}', price:250, bpm:85, mWave:'triangle', bWave:'sine',
    melody:[[E4,1],[G4,1],[B4,1],[R,1],
            [D5,1],[B4,1],[G4,1],[R,1],
            [C5,1],[E5,1],[G5,1],[R,1],
            [A4,1],[B4,1],[E5,2]],
    bass:[[E3,4],[G3,4],[C3,4],[A3,2],[B3,2]] },
  { id:'arcade-rush', name:'Arcade Rush', emoji:'\u{1F47E}', price:350, bpm:155, mWave:'square', bWave:'square',
    melody:[[E5,.5],[E5,.5],[R,.5],[E5,.5],[R,.5],[G5,.5],[E5,.5],[D5,.5],
            [C5,.5],[C5,.5],[R,.5],[C5,.5],[E5,.5],[G5,.5],[A5,.5],[G5,.5],
            [B4,.5],[B4,.5],[R,.5],[D5,.5],[E5,.5],[D5,.5],[C5,.5],[B4,.5],
            [A4,.5],[C5,.5],[E5,.5],[A5,1],[R,.5],[R,1]],
    bass:[[E3,2],[G3,2],[C3,2],[A3,2],[B3,2],[G3,2],[A3,2],[E3,2]] },
  { id:'cosmic-drift', name:'Cosmic Drift', emoji:'\u{1F30C}', price:350, bpm:90, mWave:'sine', bWave:'triangle',
    melody:[[C4,2],[G4,2],[E5,2],[C5,2],[F4,2],[C5,2],[G4,2],[E4,2]],
    bass:[[C3,4],[G3,4],[F3,4],[G3,4]] },
  { id:'victory-march', name:'Victory March', emoji:'\u{1F3C6}', price:500, bpm:140, mWave:'square', bWave:'triangle',
    melody:[[G4,.5],[G4,.5],[A4,.5],[B4,.5],[D5,1],[B4,1],
            [C5,.5],[C5,.5],[D5,.5],[E5,.5],[G5,1],[E5,1],
            [D5,.5],[E5,.5],[D5,.5],[C5,.5],[B4,1],[G4,1],
            [A4,.5],[B4,.5],[C5,.5],[D5,.5],[G5,2]],
    bass:[[G3,4],[C3,4],[D3,4],[G3,4]] },
  { id:'ocean-waves', name:'Ocean Waves', emoji:'\u{1F30A}', price:280, bpm:72, mWave:'sine', bWave:'sine',
    melody:[[E4,2],[G4,2],[B4,2],[E5,2],[D5,2],[B4,2],[G4,2],[E4,2]],
    bass:[[E3,4],[G3,4],[B3,4],[E3,4]] },
  { id:'dungeon-crawl', name:'Dungeon Crawl', emoji:'\u{1F5E1}', price:400, bpm:100, mWave:'sawtooth', bWave:'square',
    melody:[[A4,1],[C5,.5],[A4,.5],[E4,1],[R,1],
            [F4,1],[A4,.5],[F4,.5],[D4,1],[R,1],
            [G4,.5],[B4,.5],[D5,1],[C5,.5],[B4,.5],[A4,1],[R,.5]],
    bass:[[A3,4],[F3,4],[G3,4],[A3,4]] },
  { id:'candy-pop', name:'Candy Pop', emoji:'\u{1F36C}', price:300, bpm:145, mWave:'square', bWave:'triangle',
    melody:[[C5,.5],[E5,.5],[G5,.5],[E5,.5],[C5,.5],[G5,.5],[E5,.5],[C5,.5],
            [D5,.5],[F5,.5],[A5,.5],[F5,.5],[D5,.5],[A5,.5],[F5,.5],[D5,.5],
            [E5,1],[G5,1],[C6,2]],
    bass:[[C3,4],[D3,4],[E3,2],[G3,2]] },
  { id:'midnight-jazz', name:'Midnight Jazz', emoji:'\u{1F3B7}', price:450, bpm:80, mWave:'triangle', bWave:'sine',
    melody:[[G4,1.5],[B4,.5],[D5,1],[C5,1],
            [A4,1.5],[C5,.5],[E5,1],[D5,1],
            [B4,1],[D5,.5],[G5,.5],[F5,1],[E5,1],
            [D5,2],[R,2]],
    bass:[[G3,4],[A3,4],[B3,4],[G3,4]] },
]

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = ctx.createGain()
    masterGain.connect(ctx.destination)
    musicGain = ctx.createGain()
    musicGain.connect(masterGain)
    musicGain.gain.value = 0.25
    try { muted = localStorage.getItem('soundMuted') === 'true' } catch {}
    masterGain.gain.value = muted ? 0 : 1
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function playClick() {
  if (muted) return
  const now = Date.now()
  if (now - lastClickTime < 50) return
  lastClickTime = now
  const c = getCtx()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.connect(g)
  g.connect(masterGain)
  osc.type = 'square'
  osc.frequency.setValueAtTime(800, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(500, c.currentTime + 0.04)
  g.gain.setValueAtTime(0.06, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.06)
}

export function playCoinSound() {
  if (muted) return
  const c = getCtx()
  const freqs = [523, 659, 784, 1047, 1319, 784, 1047, 1319, 1568]
  freqs.forEach((f, i) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(masterGain)
    osc.type = 'square'
    const t = c.currentTime + i * 0.07
    osc.frequency.setValueAtTime(f, t)
    g.gain.setValueAtTime(0.08, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc.start(t)
    osc.stop(t + 0.12)
  })
}

function scheduleLoop(track) {
  const c = getCtx()
  const beatDur = 60 / track.bpm
  const startTime = c.currentTime + 0.05
  activeNodes = []

  let mTime = startTime
  for (const [freq, dur] of track.melody) {
    const nd = dur * beatDur
    if (freq > 0) {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.connect(g)
      g.connect(musicGain)
      osc.type = track.mWave
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.18, mTime)
      g.gain.setValueAtTime(0.18, mTime + nd * 0.85)
      g.gain.linearRampToValueAtTime(0, mTime + nd)
      osc.start(mTime)
      osc.stop(mTime + nd)
      activeNodes.push(osc)
    }
    mTime += nd
  }
  const loopDur = mTime - startTime

  let bTime = startTime
  for (const [freq, dur] of track.bass) {
    const nd = dur * beatDur
    if (freq > 0) {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.connect(g)
      g.connect(musicGain)
      osc.type = track.bWave
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.1, bTime)
      g.gain.setValueAtTime(0.1, bTime + nd * 0.9)
      g.gain.linearRampToValueAtTime(0, bTime + nd)
      osc.start(bTime)
      osc.stop(bTime + nd)
      activeNodes.push(osc)
    }
    bTime += nd
  }

  loopTimer = setTimeout(() => {
    if (currentTrackId === track.id) scheduleLoop(track)
  }, Math.max(50, (loopDur - 0.1) * 1000))
}

export function playTrack(trackId) {
  stopTrack()
  const track = MUSIC_TRACKS.find(t => t.id === trackId)
  if (!track) return
  getCtx()
  currentTrackId = trackId
  scheduleLoop(track)
}

export function stopTrack() {
  currentTrackId = null
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null }
  activeNodes.forEach(n => { try { n.stop() } catch {} })
  activeNodes = []
}

export function previewTrack(trackId) {
  if (muted) return
  const track = MUSIC_TRACKS.find(t => t.id === trackId)
  if (!track) return
  const c = getCtx()
  const beatDur = 60 / track.bpm
  const preview = track.melody.slice(0, 6)
  let t = c.currentTime
  for (const [freq, dur] of preview) {
    const nd = dur * beatDur
    if (freq > 0) {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.connect(g)
      g.connect(masterGain)
      osc.type = track.mWave
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.12, t)
      g.gain.linearRampToValueAtTime(0, t + nd)
      osc.start(t)
      osc.stop(t + nd)
    }
    t += nd
  }
}

export function getCurrentTrackId() { return currentTrackId }
export function isMuted() { return muted }

export function toggleMute() {
  muted = !muted
  try { localStorage.setItem('soundMuted', String(muted)) } catch {}
  if (masterGain) masterGain.gain.value = muted ? 0 : 1
  return muted
}

/**
 * Rising major arpeggio with a soft bell on top: the "you got it" sound for a
 * correct revision card. Synthesised like the other effects, so there is no
 * audio file to download.
 */
export function playCorrectChime() {
  if (muted) return
  const c = getCtx()
  const start = c.currentTime
  // C5 - E5 - G5 - C6, each softly overlapping the last.
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(masterGain)
    osc.type = i === notes.length - 1 ? 'sine' : 'triangle'
    const t = start + i * 0.075
    osc.frequency.setValueAtTime(f, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(i === notes.length - 1 ? 0.14 : 0.1, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.7 : 0.3))
    osc.start(t)
    osc.stop(t + 0.8)
  })
  // A little shimmer over the top of the final note.
  const shimmer = c.createOscillator()
  const sg = c.createGain()
  shimmer.connect(sg)
  sg.connect(masterGain)
  shimmer.type = 'sine'
  shimmer.frequency.setValueAtTime(2093, start + 0.24)
  shimmer.frequency.exponentialRampToValueAtTime(3136, start + 0.5)
  sg.gain.setValueAtTime(0.0001, start + 0.24)
  sg.gain.exponentialRampToValueAtTime(0.05, start + 0.3)
  sg.gain.exponentialRampToValueAtTime(0.0001, start + 0.75)
  shimmer.start(start + 0.24)
  shimmer.stop(start + 0.8)
}
