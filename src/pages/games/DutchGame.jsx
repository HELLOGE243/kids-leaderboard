import { useState, useEffect, useRef } from 'react'

const SUITS = ['♠', '♥', '♦', '♣']
const SUIT_COLORS = { '♠': '#e8e8e8', '♥': '#ff6b6b', '♦': '#ff6b6b', '♣': '#e8e8e8' }
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
const VALUES = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13 }
const CPU_NAMES = ['Ace', 'Blaze', 'Storm']

function createDeck() {
  const deck = []
  let id = 0
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: id++, rank, suit, value: VALUES[rank] })
    }
  }
  deck.push({ id: id++, rank: 'JKR', suit: '★', value: 0 })
  deck.push({ id: id++, rank: 'JKR', suit: '★', value: 0 })
  return deck
}

function shuffleArr(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function handTotal(cards) { return cards.reduce((s, c) => s + c.value, 0) }
function isPowerCard(card) { return card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' }
function cardLabel(c) { return c.rank === 'JKR' ? 'Joker' : c.rank + c.suit }
function cardColor(c) { return c.suit === '★' ? '#ffd700' : (SUIT_COLORS[c.suit] || '#e8e8e8') }

function initGame() {
  const deck = shuffleArr(createDeck())
  const players = []
  for (let i = 0; i < 4; i++) {
    players.push({
      name: i === 0 ? 'You' : CPU_NAMES[i - 1],
      isHuman: i === 0,
      cards: deck.slice(i * 5, (i + 1) * 5),
      peeked: [],
      memory: {},
    })
  }
  const remaining = deck.slice(20)
  for (let p = 1; p < 4; p++) {
    const idxs = shuffleArr([0,1,2,3,4]).slice(0, 2)
    idxs.forEach(i => {
      players[p].peeked.push(i)
      players[p].memory[i] = players[p].cards[i].value
    })
  }
  return {
    phase: 'peek',
    turnPhase: 'peek-select',
    currentPlayer: 0,
    players,
    deck: remaining.slice(1),
    discard: [remaining[0]],
    heldCard: null,
    peeksLeft: 2,
    peekingCard: null,
    dutchCaller: null,
    dutchTurnsLeft: -1,
    queenOwnIdx: null,
  }
}

function deepClone(g) {
  const c = { ...g, deck: [...g.deck], discard: [...g.discard], players: g.players.map(p => ({ ...p, cards: [...p.cards], peeked: [...p.peeked], memory: { ...p.memory } })) }
  if (g.heldCard) c.heldCard = { ...g.heldCard }
  return c
}

function computeCpuAction(g) {
  const ng = deepClone(g)
  const pIdx = ng.currentPlayer
  const cpu = ng.players[pIdx]
  const topDiscard = ng.discard[ng.discard.length - 1]

  if (ng.dutchCaller === null) {
    const knownIdxs = Object.keys(cpu.memory).map(Number).filter(i => i < cpu.cards.length)
    const knownTotal = knownIdxs.reduce((s, i) => s + cpu.memory[i], 0)
    const unknownCount = cpu.cards.length - knownIdxs.length
    if (unknownCount === 0 && knownTotal <= 10) {
      ng.dutchCaller = pIdx
      ng.dutchTurnsLeft = 3
      return { game: ng, msg: `${cpu.name} calls DUTCH!`, isDutch: true }
    }
  }

  let takeDiscard = false
  let swapIdx = -1

  if (topDiscard.value <= 4 && !isPowerCard(topDiscard)) {
    let maxVal = -1, maxIdx = -1
    for (const idx of Object.keys(cpu.memory).map(Number)) {
      if (idx < cpu.cards.length && cpu.memory[idx] > topDiscard.value && cpu.memory[idx] > maxVal) {
        maxVal = cpu.memory[idx]; maxIdx = idx
      }
    }
    if (maxIdx >= 0) { takeDiscard = true; swapIdx = maxIdx }
    else if (topDiscard.value <= 2) {
      const unk = cpu.cards.map((_, i) => i).filter(i => cpu.memory[i] === undefined)
      if (unk.length > 0) { takeDiscard = true; swapIdx = unk[Math.floor(Math.random() * unk.length)] }
    }
  }

  if (takeDiscard) {
    const old = cpu.cards[swapIdx]
    cpu.cards[swapIdx] = topDiscard
    cpu.memory[swapIdx] = topDiscard.value
    ng.discard.pop()
    ng.discard.push(old)
    let msg = `${cpu.name} takes ${cardLabel(topDiscard)}`
    if (isPowerCard(old)) { applyCpuPower(ng, pIdx, old); msg += ` — ${old.rank} power!` }
    const bonus = applyCpuBonusDiscards(ng, pIdx)
    if (bonus.length > 0) msg += ` + discards ${bonus.join(', ')}`
    return { game: ng, msg }
  }

  if (ng.deck.length === 0) {
    const top = ng.discard.pop()
    ng.deck = shuffleArr(ng.discard)
    ng.discard = top ? [top] : []
  }
  if (ng.deck.length === 0) return { game: ng, msg: `${cpu.name} passes (empty deck)` }

  const drawn = ng.deck.shift()
  if (drawn.value <= 5) {
    let maxVal = -1, maxIdx = -1
    for (const idx of Object.keys(cpu.memory).map(Number)) {
      if (idx < cpu.cards.length && cpu.memory[idx] > drawn.value && cpu.memory[idx] > maxVal) {
        maxVal = cpu.memory[idx]; maxIdx = idx
      }
    }
    if (maxIdx >= 0) swapIdx = maxIdx
    else {
      const unk = cpu.cards.map((_, i) => i).filter(i => cpu.memory[i] === undefined)
      swapIdx = unk.length > 0 ? unk[Math.floor(Math.random() * unk.length)] : 0
    }
  } else {
    const unk = cpu.cards.map((_, i) => i).filter(i => cpu.memory[i] === undefined)
    if (unk.length > 0) swapIdx = unk[Math.floor(Math.random() * unk.length)]
    else {
      let maxVal = -1, maxIdx = -1
      for (const idx of Object.keys(cpu.memory).map(Number)) {
        if (idx < cpu.cards.length && cpu.memory[idx] > maxVal) { maxVal = cpu.memory[idx]; maxIdx = idx }
      }
      swapIdx = maxIdx >= 0 ? maxIdx : 0
    }
  }

  const old = cpu.cards[swapIdx]
  cpu.cards[swapIdx] = drawn
  cpu.memory[swapIdx] = drawn.value
  ng.discard.push(old)
  let msg = `${cpu.name} draws and swaps`
  if (isPowerCard(old)) { applyCpuPower(ng, pIdx, old); msg += ` — ${old.rank} power!` }
  const bonus2 = applyCpuBonusDiscards(ng, pIdx)
  if (bonus2.length > 0) msg += ` + discards ${bonus2.join(', ')}`
  return { game: ng, msg }
}

function applyCpuPower(g, pIdx, powerCard) {
  const cpu = g.players[pIdx]
  const useJack = powerCard.rank === 'J' || (powerCard.rank === 'K' && Object.keys(cpu.memory).map(Number).filter(i => i < cpu.cards.length).length < cpu.cards.length)

  if (useJack) {
    const unk = cpu.cards.map((_, i) => i).filter(i => cpu.memory[i] === undefined)
    if (unk.length > 0) {
      const pi = unk[Math.floor(Math.random() * unk.length)]
      cpu.memory[pi] = cpu.cards[pi].value
    }
  } else {
    let highIdx = -1, highVal = -1
    for (const idx of Object.keys(cpu.memory).map(Number)) {
      if (idx < cpu.cards.length && cpu.memory[idx] > highVal) { highVal = cpu.memory[idx]; highIdx = idx }
    }
    if (highIdx >= 0 && highVal >= 7) {
      const opps = [0,1,2,3].filter(i => i !== pIdx)
      const oi = opps[Math.floor(Math.random() * opps.length)]
      const opp = g.players[oi]
      const oci = Math.floor(Math.random() * opp.cards.length)
      const tmp = cpu.cards[highIdx]
      cpu.cards[highIdx] = opp.cards[oci]
      opp.cards[oci] = tmp
      delete cpu.memory[highIdx]
      if (!opp.isHuman && opp.memory) delete opp.memory[oci]
      if (opp.isHuman) opp.peeked = opp.peeked.filter(i => i !== oci)
    }
  }
}

function applyCpuBonusDiscards(ng, pIdx) {
  const cpu = ng.players[pIdx]
  const msgs = []
  while (true) {
    const top = ng.discard[ng.discard.length - 1]
    if (!top || isPowerCard(top)) break
    const matchIdxs = Object.keys(cpu.memory).map(Number)
      .filter(i => i < cpu.cards.length && cpu.cards[i].rank === top.rank && !isPowerCard(cpu.cards[i]))
    if (matchIdxs.length === 0) break
    const idx = matchIdxs[0]
    const card = cpu.cards[idx]
    cpu.cards.splice(idx, 1)
    const newMem = {}
    for (const [k, v] of Object.entries(cpu.memory)) {
      const ki = Number(k)
      if (ki === idx) continue
      newMem[ki > idx ? ki - 1 : ki] = v
    }
    cpu.memory = newMem
    cpu.peeked = cpu.peeked.filter(i => i !== idx).map(i => i > idx ? i - 1 : i)
    ng.discard.push(card)
    msgs.push(cardLabel(card))
  }
  return msgs
}

function advancePlayer(g) {
  const ng = deepClone(g)
  if (ng.dutchCaller !== null && ng.currentPlayer !== ng.dutchCaller) {
    ng.dutchTurnsLeft--
    if (ng.dutchTurnsLeft <= 0) {
      ng.phase = 'showdown'
      ng.turnPhase = 'reveal'
      return ng
    }
  }
  ng.currentPlayer = (ng.currentPlayer + 1) % 4
  if (ng.dutchCaller !== null && ng.currentPlayer === ng.dutchCaller) {
    ng.currentPlayer = (ng.currentPlayer + 1) % 4
  }
  ng.heldCard = null
  ng.queenOwnIdx = null
  ng.turnPhase = ng.players[ng.currentPlayer].isHuman ? 'choose' : 'cpu-turn'
  return ng
}

function DutchGame({ userId, onBack }) {
  const [game, setGame] = useState(() => initGame())
  const [message, setMessage] = useState('Peek at 2 of your cards to memorise them')
  const [log, setLog] = useState(['Game started!'])
  const mountedRef = useRef(true)
  const timerRef = useRef(null)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; clearTimeout(timerRef.current) } }, [])

  function addLog(msg) { setLog(prev => [...prev.slice(-19), msg]) }
  function showMsg(msg, dur = 2500) {
    setMessage(msg)
    if (dur > 0) timerRef.current = setTimeout(() => { if (mountedRef.current) setMessage('') }, dur)
  }

  // CPU turn processing
  useEffect(() => {
    if (!game || game.turnPhase !== 'cpu-turn') return
    const t = setTimeout(() => {
      if (!mountedRef.current) return
      const result = computeCpuAction(game)
      showMsg(result.msg, 2000)
      addLog(result.msg)
      if (result.isDutch) {
        setGame(result.game)
        const t2 = setTimeout(() => {
          if (!mountedRef.current) return
          setGame(prev => advancePlayer(prev))
        }, 1500)
        timerRef.current = t2
      } else {
        const doneGame = { ...result.game, turnPhase: 'cpu-done' }
        setGame(doneGame)
      }
    }, 1200)
    return () => clearTimeout(t)
  }, [game?.turnPhase, game?.currentPlayer])

  useEffect(() => {
    if (!game || game.turnPhase !== 'cpu-done') return
    const t = setTimeout(() => {
      if (!mountedRef.current) return
      setGame(prev => {
        const ng = advancePlayer(prev)
        if (ng.phase === 'showdown') { showMsg('Showdown!', 0); addLog('All cards revealed!') }
        else if (ng.players[ng.currentPlayer].isHuman) { showMsg('Your turn!', 3000); addLog('Your turn.') }
        else addLog(`${ng.players[ng.currentPlayer].name}'s turn.`)
        return ng
      })
    }, 800)
    return () => clearTimeout(t)
  }, [game?.turnPhase])

  // === PEEK PHASE ===
  function handlePeekClick(cardIdx) {
    if (!game || game.phase !== 'peek' || game.peeksLeft <= 0 || game.peekingCard !== null) return
    if (game.players[0].peeked.includes(cardIdx)) return

    setGame(prev => {
      const ng = deepClone(prev)
      ng.players[0].peeked.push(cardIdx)
      ng.peekingCard = { playerIdx: 0, cardIdx }
      ng.peeksLeft--
      return ng
    })

    setTimeout(() => {
      if (!mountedRef.current) return
      setGame(prev => {
        const ng = deepClone(prev)
        ng.peekingCard = null
        if (ng.peeksLeft <= 0) {
          ng.phase = 'play'
          ng.turnPhase = 'choose'
          showMsg('Your turn! Take the discard or draw from the deck.', 3000)
          addLog('Your turn begins.')
        } else { showMsg(`Peek at ${ng.peeksLeft} more card`) }
        return ng
      })
    }, 2500)
  }

  // === DRAW / TAKE ===
  function handleTakeDiscard() {
    if (!game || game.currentPlayer !== 0 || game.turnPhase !== 'choose') return
    const topCard = game.discard[game.discard.length - 1]
    setGame(prev => {
      const ng = deepClone(prev)
      ng.heldCard = ng.discard.pop()
      ng.turnPhase = 'swap'
      return ng
    })
    showMsg(`Holding ${cardLabel(topCard)}. Tap a card to swap.`)
    addLog(`You took ${cardLabel(topCard)} from discard.`)
  }

  function handleDrawDeck() {
    if (!game || game.currentPlayer !== 0 || game.turnPhase !== 'choose' || game.deck.length === 0) return
    setGame(prev => {
      const ng = deepClone(prev)
      if (ng.deck.length === 0) {
        const top = ng.discard.pop()
        ng.deck = shuffleArr(ng.discard)
        ng.discard = top ? [top] : []
      }
      ng.heldCard = ng.deck.shift()
      ng.turnPhase = 'swap'
      return ng
    })
    setTimeout(() => {
      setGame(prev => {
        if (prev?.heldCard) showMsg(`You drew ${cardLabel(prev.heldCard)}. Tap a card to swap.`)
        return prev
      })
    }, 50)
    addLog('You drew from the deck.')
  }

  // === SWAP ===
  function handleSwapCard(cardIdx) {
    if (!game || game.turnPhase !== 'swap' || !game.heldCard || game.currentPlayer !== 0) return
    const player = game.players[0]
    if (cardIdx >= player.cards.length) return

    const discardedCard = player.cards[cardIdx]
    addLog(`Swapped card ${cardIdx + 1}. Discarded ${cardLabel(discardedCard)}.`)

    setGame(prev => {
      const ng = deepClone(prev)
      const p = ng.players[0]
      const old = p.cards[cardIdx]
      p.cards[cardIdx] = ng.heldCard
      if (!p.peeked.includes(cardIdx)) p.peeked.push(cardIdx)
      ng.discard.push(old)
      ng.heldCard = null

      if (isPowerCard(old)) {
        if (old.rank === 'J') { ng.turnPhase = 'power-jack'; showMsg('Jack! Peek at one of your cards.', 0); return ng }
        if (old.rank === 'Q') { ng.turnPhase = 'power-queen-own'; showMsg('Queen! Select your card to swap.', 0); return ng }
        if (old.rank === 'K') { ng.turnPhase = 'power-king'; showMsg('King! Choose: Peek or Swap?', 0); return ng }
      }
      return enterMatchOrAdvance(ng)
    })
  }

  function advanceAndNotify(ng) {
    const adv = advancePlayer(ng)
    if (adv.phase === 'showdown') { showMsg('Showdown!', 0); addLog('All cards revealed!') }
    else if (adv.players[adv.currentPlayer].isHuman) { showMsg('Your turn!', 3000); addLog('Your turn.') }
    else addLog(`${adv.players[adv.currentPlayer].name}'s turn.`)
    return adv
  }

  // === MATCH DISCARD (multi-card) ===
  function enterMatchOrAdvance(ng) {
    const top = ng.discard[ng.discard.length - 1]
    if (top && !isPowerCard(top) && ng.players[0].cards.length > 0) {
      ng.turnPhase = 'discard-match'
      showMsg(`Discard matching ${top.rank}s or tap Done`, 0)
      return ng
    }
    return advanceAndNotify(ng)
  }

  function handleMatchDiscard(cardIdx) {
    if (!game || game.turnPhase !== 'discard-match' || game.currentPlayer !== 0) return
    const card = game.players[0].cards[cardIdx]
    const topDiscard = game.discard[game.discard.length - 1]

    if (isPowerCard(card)) { showMsg("Can't discard power cards!"); return }

    if (card.rank === topDiscard.rank) {
      addLog(`Bonus discard: ${cardLabel(card)}!`)
      setGame(prev => {
        const ng = deepClone(prev)
        const p = ng.players[0]
        p.cards.splice(cardIdx, 1)
        p.peeked = p.peeked.filter(i => i !== cardIdx).map(i => i > cardIdx ? i - 1 : i)
        ng.discard.push(card)
        if (p.cards.length === 0) { showMsg('All cards discarded!'); return advanceAndNotify(ng) }
        showMsg(`Discarded ${cardLabel(card)}! Tap more or Done`, 0)
        return ng
      })
    } else {
      showMsg(`Wrong! ${cardLabel(card)} doesn't match. +2 penalty!`, 3000)
      addLog(`Failed match: ${cardLabel(card)}. Penalty!`)
      setGame(prev => {
        const ng = deepClone(prev)
        const p = ng.players[0]
        if (ng.deck.length < 2) {
          const top = ng.discard.pop()
          ng.deck = shuffleArr(ng.discard)
          ng.discard = top ? [top] : []
        }
        if (ng.deck.length > 0) p.cards.push(ng.deck.shift())
        if (ng.deck.length > 0) p.cards.push(ng.deck.shift())
        return advanceAndNotify(ng)
      })
    }
  }

  function handleMatchDone() {
    if (!game || game.turnPhase !== 'discard-match') return
    setGame(prev => advanceAndNotify(deepClone(prev)))
  }

  // === POWER CARDS ===
  function handleJackPeek(cardIdx) {
    if (!game || game.turnPhase !== 'power-jack' || game.currentPlayer !== 0) return
    const card = game.players[0].cards[cardIdx]
    addLog(`Peeked: card ${cardIdx + 1} is ${cardLabel(card)}`)

    setGame(prev => {
      const ng = deepClone(prev)
      if (!ng.players[0].peeked.includes(cardIdx)) ng.players[0].peeked.push(cardIdx)
      ng.peekingCard = { playerIdx: 0, cardIdx }
      return ng
    })
    showMsg(`Card ${cardIdx + 1}: ${cardLabel(card)}`, 0)

    setTimeout(() => {
      if (!mountedRef.current) return
      setGame(prev => {
        const ng = deepClone(prev)
        ng.peekingCard = null
        return enterMatchOrAdvance(ng)
      })
    }, 2500)
  }

  function handleQueenSelectOwn(cardIdx) {
    if (!game || game.turnPhase !== 'power-queen-own' || game.currentPlayer !== 0) return
    setGame(prev => ({ ...prev, queenOwnIdx: cardIdx, turnPhase: 'power-queen-opp' }))
    showMsg('Now tap an opponent\'s card to swap with.', 0)
  }

  function handleQueenSelectOpp(playerIdx, cardIdx) {
    if (!game || game.turnPhase !== 'power-queen-opp' || game.currentPlayer !== 0 || playerIdx === 0) return
    const ownIdx = game.queenOwnIdx
    addLog(`Queen swap: your card ${ownIdx + 1} with ${game.players[playerIdx].name}'s card ${cardIdx + 1}`)

    setGame(prev => {
      const ng = deepClone(prev)
      const own = ng.players[0]
      const opp = ng.players[playerIdx]
      const tmp = own.cards[ownIdx]
      own.cards[ownIdx] = opp.cards[cardIdx]
      opp.cards[cardIdx] = tmp
      own.peeked = own.peeked.filter(i => i !== ownIdx)
      if (!opp.isHuman && opp.memory) delete opp.memory[cardIdx]
      ng.queenOwnIdx = null
      return enterMatchOrAdvance(ng)
    })
  }

  function handleKingChoice(choice) {
    if (!game || game.turnPhase !== 'power-king') return
    if (choice === 'jack') {
      setGame(prev => ({ ...prev, turnPhase: 'power-jack' }))
      showMsg('Peek at one of your cards.', 0)
    } else {
      setGame(prev => ({ ...prev, turnPhase: 'power-queen-own' }))
      showMsg('Select your card to swap with an opponent\'s.', 0)
    }
  }

  // === DUTCH ===
  function handleDutch() {
    if (!game || game.currentPlayer !== 0 || game.turnPhase !== 'choose' || game.dutchCaller !== null) return
    addLog('You called DUTCH!')
    setGame(prev => {
      const ng = deepClone(prev)
      ng.dutchCaller = 0
      ng.dutchTurnsLeft = 3
      return ng
    })
    showMsg('DUTCH! Everyone gets one more turn!', 3000)
    setTimeout(() => {
      if (!mountedRef.current) return
      setGame(prev => {
        const adv = advancePlayer(prev)
        addLog(`${adv.players[adv.currentPlayer].name}'s turn.`)
        return adv
      })
    }, 1500)
  }

  // === OUT-OF-TURN DISCARD ===
  function handleOutOfTurn(cardIdx) {
    if (!game || game.currentPlayer === 0 || game.phase !== 'play') return
    const card = game.players[0].cards[cardIdx]
    const topDiscard = game.discard[game.discard.length - 1]

    if (isPowerCard(card)) { showMsg("Can't discard power cards out of turn!"); return }

    if (card.rank === topDiscard.rank) {
      showMsg(`Match! Discarded ${cardLabel(card)}!`)
      addLog(`Out-of-turn match: ${cardLabel(card)}!`)
      setGame(prev => {
        const ng = deepClone(prev)
        const p = ng.players[0]
        p.cards.splice(cardIdx, 1)
        p.peeked = p.peeked.filter(i => i !== cardIdx).map(i => i > cardIdx ? i - 1 : i)
        ng.discard.push(card)
        return ng
      })
    } else {
      showMsg(`Wrong! That was ${cardLabel(card)}. +2 penalty cards!`, 3000)
      addLog(`Failed match: ${cardLabel(card)}. Penalty!`)
      setGame(prev => {
        const ng = deepClone(prev)
        const p = ng.players[0]
        if (ng.deck.length < 2) {
          const top = ng.discard.pop()
          ng.deck = shuffleArr(ng.discard)
          ng.discard = top ? [top] : []
        }
        if (ng.deck.length > 0) p.cards.push(ng.deck.shift())
        if (ng.deck.length > 0) p.cards.push(ng.deck.shift())
        return ng
      })
    }
  }

  // === RESET ===
  function resetGame() {
    clearTimeout(timerRef.current)
    setGame(initGame())
    setMessage('Peek at 2 of your cards to memorise them')
    setLog(['New game started!'])
  }

  if (!game) return null

  const discardTop = game.discard.length > 0 ? game.discard[game.discard.length - 1] : null
  const isMyTurn = game.currentPlayer === 0 && game.phase === 'play'

  function renderCard(card, faceUp, onClick, opts = {}) {
    const { small, peeking, glow, clickable } = opts
    const cls = ['dutch-card']
    if (faceUp || peeking) cls.push('dutch-card-up')
    else cls.push('dutch-card-down')
    if (small) cls.push('dutch-card-sm')
    if (peeking) cls.push('dutch-card-peek')
    if (glow) cls.push('dutch-card-glow')
    if (clickable) cls.push('dutch-card-click')

    if (faceUp || peeking) {
      const color = cardColor(card)
      return (
        <div className={cls.join(' ')} onClick={onClick}>
          <span className="dutch-card-tl" style={{ color }}>{card.rank}</span>
          <span className="dutch-card-suit" style={{ color }}>{card.suit}</span>
          <span className="dutch-card-br" style={{ color }}>{card.rank}</span>
        </div>
      )
    }
    return <div className={cls.join(' ')} onClick={onClick} />
  }

  function renderPlayerRow(pIdx) {
    const player = game.players[pIdx]
    const isCurrent = game.currentPlayer === pIdx
    const isPeekPhase = game.phase === 'peek' && pIdx === 0

    return (
      <div className={`dutch-player-row ${isCurrent ? 'dutch-player-active' : ''} ${pIdx === game.dutchCaller ? 'dutch-player-dutch' : ''}`}>
        <div className="dutch-player-label">
          <span className="dutch-player-name">{player.name}</span>
          {game.phase === 'showdown' && <span className="dutch-player-total">= {handTotal(player.cards)}</span>}
          {pIdx === game.dutchCaller && <span className="dutch-badge">DUTCH</span>}
          {isCurrent && !player.isHuman && game.turnPhase === 'cpu-turn' && <span className="dutch-thinking">thinking...</span>}
        </div>
        <div className="dutch-cards-row">
          {player.cards.map((card, cIdx) => {
            const isPeeking = game.peekingCard?.playerIdx === pIdx && game.peekingCard?.cardIdx === cIdx
            const showFace = game.phase === 'showdown' || isPeeking

            let onClick, clickable = false
            if (pIdx === 0) {
              if (isPeekPhase && !game.peekingCard) { onClick = () => handlePeekClick(cIdx); clickable = true }
              else if (game.turnPhase === 'swap' && game.currentPlayer === 0) { onClick = () => handleSwapCard(cIdx); clickable = true }
              else if (game.turnPhase === 'power-jack' && game.currentPlayer === 0) { onClick = () => handleJackPeek(cIdx); clickable = true }
              else if (game.turnPhase === 'power-queen-own' && game.currentPlayer === 0) { onClick = () => handleQueenSelectOwn(cIdx); clickable = true }
              else if (game.turnPhase === 'discard-match' && game.currentPlayer === 0) { onClick = () => handleMatchDiscard(cIdx); clickable = true }
              else if (game.currentPlayer !== 0 && game.phase === 'play' && game.turnPhase !== 'cpu-turn') { onClick = () => handleOutOfTurn(cIdx); clickable = true }
            } else {
              if (game.turnPhase === 'power-queen-opp' && game.currentPlayer === 0) { onClick = () => handleQueenSelectOpp(pIdx, cIdx); clickable = true }
            }

            return (
              <div key={`p${pIdx}-c${cIdx}`} style={{ position: 'relative' }}>
                {renderCard(card, showFace, onClick, { small: pIdx !== 0, peeking: isPeeking, glow: (game.turnPhase === 'power-queen-opp' && pIdx !== 0) || (game.turnPhase === 'discard-match' && pIdx === 0), clickable })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="dutch-game">
      <div className="dutch-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="dutch-title">Dutch</div>
        <div className="dutch-deck-info">{game.deck.length} in deck</div>
      </div>

      {message && <div className="dutch-message">{message}</div>}

      <div className="dutch-opponents">
        {renderPlayerRow(1)}
        {renderPlayerRow(2)}
        {renderPlayerRow(3)}
      </div>

      <div className="dutch-table">
        <div className="dutch-pile-wrap">
          <div className="dutch-pile-label">Deck</div>
          <div
            className={`dutch-card dutch-card-down dutch-deck-stack ${isMyTurn && game.turnPhase === 'choose' ? 'dutch-card-click' : ''}`}
            onClick={() => isMyTurn && game.turnPhase === 'choose' && handleDrawDeck()}
          >
            <div className="dutch-deck-badge">{game.deck.length}</div>
          </div>
        </div>
        <div className="dutch-pile-wrap">
          <div className="dutch-pile-label">Discard</div>
          {discardTop ? renderCard(discardTop, true, () => isMyTurn && game.turnPhase === 'choose' && handleTakeDiscard(), { clickable: isMyTurn && game.turnPhase === 'choose' }) : <div className="dutch-card dutch-card-empty" />}
        </div>
      </div>

      {game.heldCard && (
        <div className="dutch-held">
          <span className="dutch-held-label">Holding:</span>
          {renderCard(game.heldCard, true)}
        </div>
      )}

      {renderPlayerRow(0)}

      <div className="dutch-actions">
        {game.phase === 'play' && game.currentPlayer === 0 && game.turnPhase === 'choose' && game.dutchCaller === null && (
          <button className="dutch-btn-dutch" onClick={handleDutch}>DUTCH!</button>
        )}
        {game.turnPhase === 'discard-match' && game.currentPlayer === 0 && (
          <button className="btn" onClick={handleMatchDone}>Done</button>
        )}
        {game.turnPhase === 'power-king' && (
          <div className="dutch-king-choice">
            <button className="btn" onClick={() => handleKingChoice('jack')}>Peek (Jack)</button>
            <button className="btn" onClick={() => handleKingChoice('queen')}>Swap (Queen)</button>
          </div>
        )}
      </div>

      {game.phase === 'showdown' && (() => {
        const totals = game.players.map((p, i) => ({ name: p.name, total: handTotal(p.cards), idx: i }))
        totals.sort((a, b) => a.total - b.total)
        const winner = totals[0]
        return (
          <div className="dutch-showdown">
            <div className="dutch-showdown-title">Results</div>
            {totals.map((t, i) => (
              <div key={t.idx} className={`dutch-result-row ${i === 0 ? 'dutch-result-winner' : ''}`}>
                <span className="dutch-result-rank">{i === 0 ? '👑' : `#${i + 1}`}</span>
                <span className="dutch-result-name">{t.name}</span>
                <span className="dutch-result-total">{t.total} pts</span>
                {t.idx === game.dutchCaller && <span className="dutch-badge">DUTCH</span>}
              </div>
            ))}
            {game.dutchCaller !== null && winner.idx !== game.dutchCaller && (
              <div className="dutch-penalty-note">{game.players[game.dutchCaller].name} called Dutch but didn't win!</div>
            )}
            <div className="dutch-showdown-btns">
              <button className="btn" onClick={resetGame}>Play Again</button>
              <button className="btn btn-outline" onClick={onBack}>Back</button>
            </div>
          </div>
        )
      })()}

      <div className="dutch-log">
        {log.slice(-6).map((msg, i) => <div key={i} className="dutch-log-entry">{msg}</div>)}
      </div>
    </div>
  )
}

export default DutchGame
