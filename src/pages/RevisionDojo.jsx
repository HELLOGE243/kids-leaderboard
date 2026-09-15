import { useState, useEffect } from 'react'
import {
  getDueDojoCards,
  getDojoCardsForStudent,
  getDojoAskTeacherCards,
  getDojoArchivedCards,
  getDojoEndlessCards,
  getDojoKills,
  recordDojoAnswer,
  markDojoAskTeacher,
  returnDojoCardToTraining,
  redeemDojoKills,
  reportQuestionError,
  saveDojoClones,
  reportDojoClone,
  findQuizSetLocation,
  archiveDojoCard,
  unarchiveDojoCard,
  addCustomDojoCard,
  getDojoTopics,
} from '../data/store.js'
import { generateShadowClones } from '../utils/aiChat.js'
import { authedFetch } from '../data/auth.js'
import ReportIssueModal from '../components/ReportIssueModal.jsx'


// src: full image. placeholder: a 24px blurred copy inlined so something shows instantly.
const WALLPAPERS = [
  {
    name: 'grand-hall',
    src: '/wallpapers/dojo-hall.webp',
    placeholder: 'data:image/webp;base64,UklGRqAAAABXRUJQVlA4IJQAAACQBACdASoYAA0APu1iqU2ppaQiMAgBMB2JYgCdMoR8eB+C2RTUByrZ7R4DcwAA/odW151zjrzU0snC94xG5CnO0C5jfWrKFWwHWeoZrhl31S2zlgAPinD4VtCeP5jqDN+3FZu3O138I45xPq693DcQwBLQeKYMNS+m6ED1J7ZgHgL5K5W4lXsecbc0OD5fVkO8GoAA',
  },
]

// Download and decode the background once, shared by every visit. Portal calls
// this on load so the image is usually ready before the student opens the dojo.
const wallpaperLoads = new Map()
export function preloadDojoWallpapers() {
  for (const w of WALLPAPERS) loadWallpaper(w.src)
}
function loadWallpaper(src) {
  if (!wallpaperLoads.has(src)) {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    wallpaperLoads.set(src, (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej })).then(() => true, () => false))
  }
  return wallpaperLoads.get(src)
}

/* WALLPAPERS_OLD_SVG_START — kept for reference, remove when more images are added
  { name: 'moonlit-mountains', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <circle cx='12' cy='8' r='.4' fill='#fff' opacity='.5'/>
      <circle cx='35' cy='5' r='.5' fill='#fff' opacity='.4'/>
      <circle cx='58' cy='12' r='.3' fill='#fff' opacity='.6'/>
      <circle cx='90' cy='6' r='.5' fill='#fff' opacity='.3'/>
      <circle cx='120' cy='4' r='.4' fill='#fff' opacity='.5'/>
      <circle cx='145' cy='10' r='.5' fill='#fff' opacity='.4'/>
      <circle cx='75' cy='18' r='.3' fill='#fff' opacity='.3'/>
      <circle cx='42' cy='22' r='.3' fill='#fff' opacity='.4'/>
      <circle cx='125' cy='22' r='6' fill='#d0cbb8' opacity='.85'/>
      <circle cx='125' cy='22' r='12' fill='#d0cbb8' opacity='.05'/>
      <path d='M0 70 L18 48 L35 60 L55 40 L75 52 L95 36 L115 46 L135 32 L155 48 L160 44 L160 100 L0 100Z' fill='#141432' opacity='.6'/>
      <path d='M0 78 L25 55 L48 66 L70 48 L95 58 L120 45 L145 56 L160 50 L160 100 L0 100Z' fill='#0e0e28'/>
      <path d='M0 90 L40 82 L80 86 L120 80 L160 84 L160 100 L0 100Z' fill='#0a0a20'/>
    </svg>
  `, 'linear-gradient(180deg, #080822 0%, #0c0c2e 50%, #0a0a28 100%)') },

  { name: 'crimson-torii', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <circle cx='80' cy='28' r='14' fill='#ff4020' opacity='.12'/>
      <circle cx='80' cy='28' r='7' fill='#ff6040' opacity='.2'/>
      <rect x='62' y='30' width='3.5' height='60' fill='#2a0808'/>
      <rect x='94.5' y='30' width='3.5' height='60' fill='#2a0808'/>
      <rect x='56' y='28' width='48' height='4' rx='1' fill='#2a0808'/>
      <path d='M54 28 L80 22 L106 28 L104 30 L80 24 L56 30Z' fill='#2a0808'/>
      <rect x='60' y='38' width='40' height='3' fill='#2a0808'/>
      <rect x='72' y='86' width='16' height='4' rx='1' fill='#1a0505' opacity='.6'/>
      <rect x='68' y='82' width='24' height='4' rx='1' fill='#1a0505' opacity='.4'/>
      <path d='M0 92 L160 92 L160 100 L0 100Z' fill='#0f0404'/>
    </svg>
  `, 'linear-gradient(180deg, #1a0606 0%, #2a0c0c 40%, #1a0808 100%)') },

  { name: 'bamboo-grove', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <rect x='8' y='0' width='2.5' height='100' fill='#1a3520' opacity='.7'/>
      <rect x='8' y='30' width='3' height='1.2' fill='#244530' opacity='.5'/>
      <rect x='8' y='62' width='3' height='1.2' fill='#244530' opacity='.5'/>
      <line x1='10.5' y1='25' x2='18' y2='20' stroke='#1a3520' stroke-width='.6' opacity='.5'/>
      <line x1='8' y1='55' x2='2' y2='50' stroke='#1a3520' stroke-width='.6' opacity='.4'/>
      <rect x='30' y='0' width='2' height='100' fill='#183020' opacity='.55'/>
      <rect x='30' y='35' width='2.5' height='1.2' fill='#224030' opacity='.4'/>
      <line x1='32' y1='28' x2='38' y2='23' stroke='#183020' stroke-width='.5' opacity='.4'/>
      <rect x='55' y='0' width='3' height='100' fill='#1d3822' opacity='.75'/>
      <rect x='55' y='22' width='3.5' height='1.2' fill='#2a4832' opacity='.5'/>
      <rect x='55' y='52' width='3.5' height='1.2' fill='#2a4832' opacity='.5'/>
      <rect x='55' y='78' width='3.5' height='1.2' fill='#2a4832' opacity='.5'/>
      <line x1='58' y1='18' x2='65' y2='13' stroke='#1d3822' stroke-width='.7' opacity='.5'/>
      <line x1='55' y1='45' x2='48' y2='40' stroke='#1d3822' stroke-width='.6' opacity='.4'/>
      <rect x='80' y='0' width='2' height='100' fill='#163018' opacity='.6'/>
      <rect x='80' y='40' width='2.5' height='1.2' fill='#204028' opacity='.45'/>
      <rect x='105' y='0' width='2.5' height='100' fill='#1b3520' opacity='.7'/>
      <rect x='105' y='26' width='3' height='1.2' fill='#264530' opacity='.5'/>
      <rect x='105' y='58' width='3' height='1.2' fill='#264530' opacity='.5'/>
      <line x1='107.5' y1='20' x2='114' y2='15' stroke='#1b3520' stroke-width='.6' opacity='.5'/>
      <rect x='130' y='0' width='2' height='100' fill='#153018' opacity='.55'/>
      <rect x='130' y='45' width='2.5' height='1.2' fill='#1e4028' opacity='.4'/>
      <rect x='148' y='0' width='3' height='100' fill='#1a3520' opacity='.65'/>
      <rect x='148' y='32' width='3.5' height='1.2' fill='#244530' opacity='.45'/>
      <line x1='151' y1='58' x2='156' y2='53' stroke='#1a3520' stroke-width='.6' opacity='.4'/>
      <ellipse cx='40' cy='92' rx='50' ry='10' fill='#0c1a10' opacity='.4'/>
      <ellipse cx='120' cy='95' rx='45' ry='8' fill='#0c1a10' opacity='.35'/>
    </svg>
  `, 'linear-gradient(180deg, #060f08 0%, #0c1a10 50%, #040a06 100%)') },

  { name: 'lantern-path', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <line x1='35' y1='0' x2='35' y2='18' stroke='#2a1a08' stroke-width='.5' opacity='.5'/>
      <line x1='80' y1='0' x2='80' y2='12' stroke='#2a1a08' stroke-width='.5' opacity='.5'/>
      <line x1='125' y1='0' x2='125' y2='22' stroke='#2a1a08' stroke-width='.5' opacity='.5'/>
      <circle cx='35' cy='25' r='12' fill='#ff9030' opacity='.06'/>
      <circle cx='80' cy='19' r='12' fill='#ff9030' opacity='.06'/>
      <circle cx='125' cy='29' r='12' fill='#ff9030' opacity='.06'/>
      <rect x='32' y='18' width='6' height='10' rx='1' fill='#cc4010' opacity='.7'/>
      <rect x='77' y='12' width='6' height='10' rx='1' fill='#cc4010' opacity='.7'/>
      <rect x='122' y='22' width='6' height='10' rx='1' fill='#cc4010' opacity='.7'/>
      <circle cx='35' cy='23' r='5' fill='#ffaa40' opacity='.08'/>
      <circle cx='80' cy='17' r='5' fill='#ffaa40' opacity='.08'/>
      <circle cx='125' cy='27' r='5' fill='#ffaa40' opacity='.08'/>
      <line x1='35' y1='28' x2='35' y2='30' stroke='#2a1a08' stroke-width='.4' opacity='.4'/>
      <line x1='80' y1='22' x2='80' y2='24' stroke='#2a1a08' stroke-width='.4' opacity='.4'/>
      <line x1='125' y1='32' x2='125' y2='34' stroke='#2a1a08' stroke-width='.4' opacity='.4'/>
      <path d='M0 88 L50 84 L80 86 L110 83 L160 87 L160 100 L0 100Z' fill='#12100a' opacity='.8'/>
      <path d='M0 94 L160 92 L160 100 L0 100Z' fill='#0a0806'/>
    </svg>
  `, 'linear-gradient(180deg, #0e0b05 0%, #1a1408 50%, #080604 100%)') },

  { name: 'frozen-summit', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <path d='M30 20 Q50 8 80 12 Q110 16 140 6' stroke='#4080a0' stroke-width='.8' fill='none' opacity='.12'/>
      <path d='M10 14 Q40 4 70 8 Q100 12 130 2' stroke='#3090b0' stroke-width='.6' fill='none' opacity='.08'/>
      <path d='M50 24 Q80 14 110 18 Q140 22 160 12' stroke='#50a0c0' stroke-width='.5' fill='none' opacity='.1'/>
      <path d='M0 75 L20 50 L30 58 L50 35 L60 45 L80 28 L95 42 L110 30 L125 40 L140 25 L155 38 L160 34 L160 100 L0 100Z' fill='#0c1825' opacity='.7'/>
      <path d='M48 35 L50 35 L53 37' stroke='#d0dde8' stroke-width='.8' fill='none' opacity='.5'/>
      <path d='M78 28 L80 28 L83 30' stroke='#d0dde8' stroke-width='.8' fill='none' opacity='.5'/>
      <path d='M108 30 L110 30 L113 32' stroke='#d0dde8' stroke-width='.8' fill='none' opacity='.5'/>
      <path d='M138 25 L140 25 L143 27' stroke='#d0dde8' stroke-width='.8' fill='none' opacity='.5'/>
      <path d='M0 82 L30 60 L50 70 L75 52 L100 62 L130 48 L155 58 L160 55 L160 100 L0 100Z' fill='#08121e'/>
      <path d='M0 92 L40 85 L80 88 L120 83 L160 86 L160 100 L0 100Z' fill='#060e18'/>
    </svg>
  `, 'linear-gradient(180deg, #080e18 0%, #0c1828 50%, #050a12 100%)') },

  { name: 'ember-forge', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <ellipse cx='80' cy='100' rx='60' ry='25' fill='#ff4010' opacity='.08'/>
      <ellipse cx='80' cy='100' rx='35' ry='15' fill='#ff6020' opacity='.1'/>
      <line x1='60' y1='20' x2='75' y2='50' stroke='#1a0c04' stroke-width='1.2' opacity='.6'/>
      <line x1='100' y1='20' x2='85' y2='50' stroke='#1a0c04' stroke-width='1.2' opacity='.6'/>
      <line x1='60' y1='20' x2='55' y2='15' stroke='#1a0c04' stroke-width='.8' opacity='.4'/>
      <line x1='100' y1='20' x2='105' y2='15' stroke='#1a0c04' stroke-width='.8' opacity='.4'/>
      <circle cx='70' cy='75' r='.6' fill='#ff8030' opacity='.5'/>
      <circle cx='85' cy='68' r='.5' fill='#ffa040' opacity='.4'/>
      <circle cx='78' cy='60' r='.4' fill='#ff9035' opacity='.35'/>
      <circle cx='92' cy='72' r='.5' fill='#ff7020' opacity='.45'/>
      <circle cx='65' cy='55' r='.3' fill='#ffa040' opacity='.3'/>
      <circle cx='88' cy='50' r='.3' fill='#ff8030' opacity='.25'/>
      <circle cx='75' cy='42' r='.3' fill='#ffa040' opacity='.2'/>
      <circle cx='82' cy='35' r='.2' fill='#ff9035' opacity='.15'/>
      <path d='M0 85 L60 82 L80 78 L100 82 L160 85 L160 100 L0 100Z' fill='#0a0604'/>
      <path d='M70 80 L75 70 L80 76 L85 68 L90 80Z' fill='#ff4010' opacity='.15'/>
    </svg>
  `, 'linear-gradient(180deg, #140a04 0%, #1e1008 50%, #0a0603 100%)') },

  { name: 'zen-garden', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <path d='M0 50 Q40 47 80 50 Q120 53 160 50' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.25'/>
      <path d='M0 55 Q40 52 80 55 Q120 58 160 55' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.25'/>
      <path d='M0 60 Q30 57 60 60 Q90 63 120 60 Q150 57 160 60' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.3'/>
      <path d='M0 65 Q30 62 60 65 Q90 68 120 65 Q150 62 160 65' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.3'/>
      <path d='M0 70 Q40 67 80 70 Q120 73 160 70' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.3'/>
      <path d='M0 75 Q40 72 80 75 Q120 78 160 75' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.3'/>
      <path d='M0 80 Q30 77 60 80 Q90 83 120 80 Q150 77 160 80' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.25'/>
      <path d='M0 85 Q40 82 80 85 Q120 88 160 85' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.25'/>
      <path d='M0 90 Q40 87 80 90 Q120 93 160 90' stroke='#1a1812' stroke-width='.4' fill='none' opacity='.2'/>
      <ellipse cx='45' cy='66' rx='5' ry='3.5' fill='#1a1810' opacity='.6'/>
      <ellipse cx='100' cy='72' rx='4' ry='3' fill='#1a1810' opacity='.5'/>
      <ellipse cx='72' cy='78' rx='3' ry='2' fill='#1a1810' opacity='.55'/>
      <ellipse cx='40' cy='35' rx='30' ry='15' fill='#141208' opacity='.06'/>
    </svg>
  `, 'linear-gradient(180deg, #0e0c08 0%, #141210 50%, #0a0906 100%)') },

  { name: 'storm-pagoda', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <line x1='112.5' y1='32' x2='112.5' y2='38' stroke='#0c1018' stroke-width='.8'/>
      <path d='M95 38 L110 42 L115 42 L130 38 L128 44 L97 44Z' fill='#0c1018'/>
      <rect x='100' y='44' width='25' height='12' fill='#0c1018'/>
      <path d='M92 56 L107 60 L118 60 L133 56 L131 62 L94 62Z' fill='#0c1018'/>
      <rect x='98' y='62' width='29' height='14' fill='#0c1018'/>
      <path d='M88 76 L105 80 L120 80 L137 76 L135 82 L90 82Z' fill='#0c1018'/>
      <rect x='95' y='82' width='35' height='18' fill='#0c1018'/>
      <path d='M40 15 L42 30 L44 20 L46 35 L48 22' stroke='#6080b0' stroke-width='.6' fill='none' opacity='.4'/>
      <line x1='42' y1='30' x2='35' y2='50' stroke='#6080b0' stroke-width='.3' opacity='.2'/>
      <line x1='46' y1='35' x2='52' y2='58' stroke='#6080b0' stroke-width='.3' opacity='.2'/>
      <line x1='20' y1='10' x2='18' y2='65' stroke='#4060a0' stroke-width='.15' opacity='.12'/>
      <line x1='55' y1='5' x2='53' y2='60' stroke='#4060a0' stroke-width='.15' opacity='.1'/>
      <line x1='72' y1='8' x2='70' y2='63' stroke='#4060a0' stroke-width='.15' opacity='.08'/>
      <line x1='140' y1='12' x2='138' y2='67' stroke='#4060a0' stroke-width='.15' opacity='.1'/>
      <line x1='155' y1='6' x2='153' y2='61' stroke='#4060a0' stroke-width='.15' opacity='.08'/>
      <path d='M0 92 L88 88 L160 90 L160 100 L0 100Z' fill='#060810'/>
    </svg>
  `, 'linear-gradient(180deg, #0a0c14 0%, #10141e 50%, #06080e 100%)') },

  { name: 'sakura-night', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <circle cx='130' cy='18' r='5' fill='#c0b0a0' opacity='.6'/>
      <circle cx='130' cy='18' r='10' fill='#c0b0a0' opacity='.04'/>
      <path d='M25 100 L25 50 Q25 40 30 35 Q28 30 32 25' stroke='#1a0c10' stroke-width='3' fill='none' opacity='.8'/>
      <path d='M28 45 Q40 35 55 30' stroke='#1a0c10' stroke-width='1.5' fill='none' opacity='.6'/>
      <path d='M26 55 Q15 45 8 40' stroke='#1a0c10' stroke-width='1.2' fill='none' opacity='.6'/>
      <path d='M30 35 Q45 25 60 22' stroke='#1a0c10' stroke-width='1' fill='none' opacity='.5'/>
      <path d='M32 25 Q40 18 50 15' stroke='#1a0c10' stroke-width='.8' fill='none' opacity='.4'/>
      <circle cx='48' cy='28' r='1.2' fill='#cc6080' opacity='.35'/>
      <circle cx='55' cy='22' r='1' fill='#d07090' opacity='.3'/>
      <circle cx='42' cy='18' r='.8' fill='#cc6080' opacity='.25'/>
      <circle cx='60' cy='26' r='1.1' fill='#d08090' opacity='.3'/>
      <circle cx='10' cy='38' r='1' fill='#cc6080' opacity='.3'/>
      <circle cx='15' cy='42' r='.8' fill='#d07090' opacity='.25'/>
      <circle cx='52' cy='14' r='.7' fill='#cc6080' opacity='.2'/>
      <circle cx='35' cy='32' r='1' fill='#d08090' opacity='.3'/>
      <circle cx='65' cy='35' r='.8' fill='#cc6080' opacity='.2'/>
      <circle cx='40' cy='48' r='.7' fill='#d07090' opacity='.15'/>
      <circle cx='20' cy='58' r='.6' fill='#cc6080' opacity='.12'/>
      <circle cx='55' cy='52' r='.7' fill='#d08090' opacity='.12'/>
      <circle cx='45' cy='62' r='.5' fill='#cc6080' opacity='.1'/>
      <circle cx='30' cy='72' r='.6' fill='#d07090' opacity='.08'/>
      <circle cx='70' cy='45' r='.5' fill='#cc6080' opacity='.1'/>
      <path d='M0 92 L160 92 L160 100 L0 100Z' fill='#0a0508'/>
    </svg>
  `, 'linear-gradient(180deg, #120810 0%, #1e1018 50%, #0a0508 100%)') },

  { name: 'jade-dragon', bg: svgBg(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'>
      <path d='M10 80 Q30 60 50 65 Q70 70 80 55 Q90 40 110 45 Q130 50 140 35 Q148 25 155 28' stroke='#2a6848' stroke-width='3' fill='none' opacity='.25'/>
      <path d='M10 80 Q30 60 50 65 Q70 70 80 55 Q90 40 110 45 Q130 50 140 35 Q148 25 155 28' stroke='#40a070' stroke-width='1' fill='none' opacity='.12'/>
      <circle cx='155' cy='27' r='2' fill='#2a6848' opacity='.3'/>
      <circle cx='157' cy='25' r='.6' fill='#60c090' opacity='.3'/>
      <circle cx='153' cy='25' r='.6' fill='#60c090' opacity='.3'/>
      <path d='M155 29 L158 33 L152 33Z' fill='#2a6848' opacity='.2'/>
      <path d='M10 80 L8 84 L12 82Z' fill='#2a6848' opacity='.2'/>
      <circle cx='25' cy='68' r='.4' fill='#40a070' opacity='.15'/>
      <circle cx='65' cy='62' r='.4' fill='#40a070' opacity='.12'/>
      <circle cx='95' cy='48' r='.4' fill='#40a070' opacity='.1'/>
      <circle cx='125' cy='42' r='.4' fill='#40a070' opacity='.1'/>
      <ellipse cx='40' cy='88' rx='35' ry='10' fill='#1a4030' opacity='.1'/>
      <ellipse cx='110' cy='85' rx='30' ry='8' fill='#1a4030' opacity='.08'/>
      <ellipse cx='80' cy='92' rx='45' ry='12' fill='#0a2018' opacity='.12'/>
      <path d='M0 92 L160 92 L160 100 L0 100Z' fill='#030a08'/>
    </svg>
  `, 'linear-gradient(180deg, #04100c 0%, #081a14 50%, #030a08 100%)') },
WALLPAPERS_OLD_SVG_END */

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function RevisionDojo({ user, onBack, onNavigateToQuiz }) {
  const [sceneIdx] = useState(() => Math.floor(Math.random() * WALLPAPERS.length))
  const wallpaper = WALLPAPERS[sceneIdx]
  // Hold the page behind a loading screen until the background is decoded, so
  // it appears all at once. Give up waiting after 4s (slow connection).
  const [bgReady, setBgReady] = useState(false)
  useEffect(() => {
    let alive = true
    const done = () => { if (alive) setBgReady(true) }
    loadWallpaper(wallpaper.src).then(done)
    const t = setTimeout(done, 4000)
    return () => { alive = false; clearTimeout(t) }
  }, [wallpaper.src])
  const [tab, setTab] = useState('training')
  const [dueCards, setDueCards] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(-1)
  const [answered, setAnswered] = useState(false)
  const [result, setResult] = useState(null)
  const [kills, setKills] = useState(0)
  const [chaosMode, setChaosMode] = useState(false)
  const [clones, setClones] = useState(null)
  const [cloneIdx, setCloneIdx] = useState(0)
  const [cloneAnswers, setCloneAnswers] = useState([])
  const [cloneSelected, setCloneSelected] = useState(-1)
  const [cloneAnswered, setCloneAnswered] = useState(false)
  const [cloneResult, setCloneResult] = useState(null)
  const [cloneFlipped, setCloneFlipped] = useState(false)
  const [cloneReported, setCloneReported] = useState(false)
  const [generatingClones, setGeneratingClones] = useState(false)
  const [showKillAnim, setShowKillAnim] = useState(false)
  const [dojoClearedBanner, setDojoClearedBanner] = useState(null)
  const [refresh, setRefresh] = useState(0)

  const [askViewCard, setAskViewCard] = useState(null)
  const [askSel, setAskSel] = useState(-1)
  const [askAnswered, setAskAnswered] = useState(false)
  const [askResult, setAskResult] = useState(null)

  const [archiveDeck, setArchiveDeck] = useState([])
  const [archiveIdx, setArchiveIdx] = useState(0)
  const [archiveSel, setArchiveSel] = useState(-1)
  const [archiveAnswered, setArchiveAnswered] = useState(false)
  const [archiveResult, setArchiveResult] = useState(null)
  const [archiveFlipped, setArchiveFlipped] = useState(false)
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveViewCard, setArchiveViewCard] = useState(null)
  const [archiveViewSel, setArchiveViewSel] = useState(-1)
  const [archiveViewAnswered, setArchiveViewAnswered] = useState(false)
  const [shuffling, setShuffling] = useState(false)

  const [endlessDeck, setEndlessDeck] = useState([])
  const [endlessIdx, setEndlessIdx] = useState(0)
  const [endlessSel, setEndlessSel] = useState(-1)
  const [endlessAnswered, setEndlessAnswered] = useState(false)
  const [endlessResult, setEndlessResult] = useState(null)
  const [endlessFlipped, setEndlessFlipped] = useState(false)
  const [endlessBuilding, setEndlessBuilding] = useState(true)
  const [endlessTopic, setEndlessTopic] = useState('all')
  const [endlessCount, setEndlessCount] = useState(10)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadImg, setUploadImg] = useState(null)
  const [uploadProcessing, setUploadProcessing] = useState(false)
  const [uploadPreview, setUploadPreview] = useState(null)
  const [uploadTopic, setUploadTopic] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [reportOpen, setReportOpen] = useState(null)
  const [reportType, setReportType] = useState('')
  const [reportDetails, setReportDetails] = useState('')

  const [cardFlipped, setCardFlipped] = useState(false)



  useEffect(() => {
    setDueCards(getDueDojoCards(user.id))
    setKills(getDojoKills(user.id))
  }, [user.id, refresh])

  const allCards = getDojoCardsForStudent(user.id)
  const askTeacherCards = getDojoAskTeacherCards(user.id)
  const archivedCards = getDojoArchivedCards(user.id)
  const currentCard = dueCards[currentIdx]
  const remaining = dueCards.length - currentIdx

  useEffect(() => {
    if (archivedCards.length > 0 && archiveDeck.length === 0) {
      setArchiveDeck(shuffleArray(archivedCards))
    }
  }, [archivedCards.length])

  function handleSubmitAnswer() {
    if (answered || selectedAnswer === -1) return
    setAnswered(true)
    const q = currentCard.question
    const correct = selectedAnswer === q.correctIndex
    setResult(correct ? 'correct' : 'incorrect')
    const updated = recordDojoAnswer(currentCard.id, correct)
    if (correct) {
      if (updated && updated.archived) {
        setShowKillAnim(true)
        setTimeout(() => setShowKillAnim(false), 1500)
      }
    } else {
      const qType = currentCard.question.type || 'mcq'
      const cloneTypes = ['mcq', 'multiple-choice', 'dropdown-cloze', 'drag-drop', 'drag-sentence', 'drag-summary']
      if (cloneTypes.includes(qType)) setTimeout(() => startChaosMode(), 1200)
    }
  }

  async function startChaosMode() {
    setChaosMode(true); setGeneratingClones(true); setCloneIdx(0); setCloneAnswers([]); setCloneSelected(-1); setCloneAnswered(false); setCloneResult(null)
    const q = currentCard.question
    const generated = await generateShadowClones({ questionText: q.text?.replace(/<[^>]*>/g, '') || '', options: q.options.filter(Boolean), correctIndex: q.correctIndex, correctAnswer: q.options[q.correctIndex] })
    if (generated && generated.length === 2) { setClones(generated); saveDojoClones(currentCard.id, user.id, generated) }
    else { setClones([{ text: q.text, options: q.options, correctIndex: q.correctIndex, difficulty: 'easy' }, { text: q.text, options: q.options, correctIndex: q.correctIndex, difficulty: 'hard' }]) }
    setGeneratingClones(false)
  }

  function handleCloneSubmit() {
    if (cloneAnswered || cloneSelected === -1) return
    setCloneAnswered(true)
    const clone = clones[cloneIdx]
    setCloneResult(cloneSelected === clone.correctIndex ? 'correct' : 'incorrect')
    setCloneAnswers(prev => [...prev, cloneSelected === clone.correctIndex])
  }

  function nextClone() {
    if (cloneIdx < 1) { setCloneIdx(cloneIdx + 1); setCloneSelected(-1); setCloneAnswered(false); setCloneResult(null); setCloneFlipped(false); setCloneReported(false) }
    else { if ([...cloneAnswers].filter(Boolean).length < 1) markDojoAskTeacher(currentCard.id); setChaosMode(false); setClones(null); setCloneFlipped(false); setCloneReported(false); nextCard() }
  }

  function nextCard() {
    setAnswered(false); setSelectedAnswer(-1); setResult(null); setCardFlipped(false)
    if (currentIdx < dueCards.length - 1) setCurrentIdx(currentIdx + 1)
    else {
      const earned = getDojoKills(user.id)
      if (earned > 0) {
        const tokens = earned * 5
        redeemDojoKills(user.id, earned)
        setKills(0)
        setDojoClearedBanner(tokens)
        setTimeout(() => { setDojoClearedBanner(null) }, 4000)
      }
      setRefresh(r => r + 1); setCurrentIdx(0)
    }
  }

  function handleRedeem() {
    const available = getDojoKills(user.id)
    if (available <= 0) return
    redeemDojoKills(user.id, available); setKills(0); setRefresh(r => r + 1)
  }

  function handleAskCardClick(card) {
    setAskViewCard(card); setAskSel(-1); setAskAnswered(false); setAskResult(null)
  }

  function handleAskSubmit() {
    if (askAnswered || askSel === -1 || !askViewCard) return
    setAskAnswered(true)
    setAskResult(askSel === askViewCard.question.correctIndex ? 'correct' : 'incorrect')
  }

  function handleShuffleDeck() {
    if (shuffling) return
    setShuffling(true)
    setTimeout(() => {
      setArchiveDeck(shuffleArray(archivedCards))
      setArchiveIdx(0); setArchiveSel(-1); setArchiveAnswered(false); setArchiveResult(null); setArchiveFlipped(false)
      setShuffling(false)
    }, 600)
  }

  function handleArchiveFlip() {
    if (archiveFlipped) return
    setArchiveFlipped(true)
  }

  function handleArchiveSubmit() {
    if (archiveAnswered || archiveSel === -1) return
    setArchiveAnswered(true)
    const q = archiveDeck[archiveIdx]?.question
    if (q) setArchiveResult(archiveSel === q.correctIndex ? 'correct' : 'incorrect')
  }

  function nextArchiveCard() {
    setArchiveSel(-1); setArchiveAnswered(false); setArchiveResult(null); setArchiveFlipped(false)
    setArchiveIdx(i => (i + 1) % archiveDeck.length)
  }

  function initEndless(topic, count) {
    const t = topic !== undefined ? topic : endlessTopic
    const c = count !== undefined ? count : endlessCount
    const cards = getDojoEndlessCards(user.id, { topic: t, count: c })
    const shuffled = shuffleArray(cards)
    setEndlessDeck(shuffled)
    setEndlessIdx(0)
    setEndlessSel(-1)
    setEndlessAnswered(false)
    setEndlessResult(null)
    setEndlessFlipped(false)
  }

  function startEndlessSession() {
    initEndless(endlessTopic, endlessCount)
    setEndlessBuilding(false)
  }

  function handleEndlessFlip() { setEndlessFlipped(true) }

  function handleEndlessSubmit() {
    if (endlessAnswered || endlessSel === -1) return
    const card = endlessDeck[endlessIdx]
    const correct = endlessSel === (card.question.correctIndex ?? card.question.correct)
    setEndlessResult(correct ? 'correct' : 'wrong')
    setEndlessAnswered(true)
  }

  function nextEndlessCard() {
    setEndlessSel(-1); setEndlessAnswered(false); setEndlessResult(null); setEndlessFlipped(false)
    if (endlessIdx + 1 >= endlessDeck.length) {
      setEndlessBuilding(true)
    } else {
      setEndlessIdx(i => i + 1)
    }
  }

  function handleEndlessArchive() {
    const card = endlessDeck[endlessIdx]
    if (!card) return
    archiveDojoCard(card.id)
    const newDeck = endlessDeck.filter((_, i) => i !== endlessIdx)
    setEndlessDeck(newDeck)
    if (newDeck.length === 0) {
      setEndlessBuilding(true)
    } else if (endlessIdx >= newDeck.length) {
      setEndlessIdx(0)
    }
    setEndlessSel(-1); setEndlessAnswered(false); setEndlessResult(null); setEndlessFlipped(false)
    setRefresh(r => r + 1)
  }

  function handleUnarchive(cardId) {
    unarchiveDojoCard(cardId)
    setArchiveDeck(prev => prev.filter(c => c.id !== cardId))
    setRefresh(r => r + 1)
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  async function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setUploadProcessing(true)
    setUploadPreview(null)

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      setUploadImg(reader.result)
      try {
        const res = await authedFetch('/api/claude/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            max_tokens: 600,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                { type: 'text', text: `This is a photo of a question from a student's textbook or worksheet. Convert it into a multiple-choice question with 4 options.

Return ONLY valid JSON:
{"text":"<the question text>","prompt":"","options":["A","B","C","D"],"correctIndex":0}

- text: the question stem
- options: 4 answer choices
- correctIndex: 0-based index of the correct answer
- If the image is unclear or not a question, return {"error":"Could not process this image"}` }
              ]
            }]
          })
        })
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          if (parsed.error) {
            alert(parsed.error)
            setUploadProcessing(false)
            return
          }
          setUploadPreview(parsed)
        }
      } catch (err) {
        console.error('Image processing failed:', err)
        alert('Failed to process image. Try again.')
      }
      setUploadProcessing(false)
    }
    reader.readAsDataURL(file)
  }

  function handleConfirmUpload() {
    if (!uploadPreview) return
    addCustomDojoCard(user.id, uploadPreview, user.orgId, uploadTopic)
    setUploadOpen(false)
    setUploadImg(null)
    setUploadPreview(null)
    setUploadTopic('')
    setRefresh(r => r + 1)
    initEndless()
  }

  function renderQuestionCard(q, sel, isAnswered, res, onSelect, { centerContent, rightContent, leftContent, onBack: onBack2, encounter, source, sourceId, difficulty, onReportError } = {}) {
    const hasPrompt = q.prompt && q.prompt.trim()
    const handleSourceClick = () => {
      if (!sourceId || !onNavigateToQuiz) return
      const loc = findQuizSetLocation(sourceId)
      if (loc) onNavigateToQuiz(loc)
    }
    return (
      <div className="qt-panel">
        <div className="qt-topbar">
          <div className="qt-timer-area">
            {source && <button className="dojo-meta-source" onClick={handleSourceClick} style={{ color: '#fff', background: 'none', border: 'none', cursor: sourceId ? 'pointer' : 'default', fontSize: '0.85rem' }}>{source}</button>}
            {difficulty && <span className="dojo-clone-diff" data-diff={difficulty}>{difficulty.toUpperCase()}</span>}
          </div>
          <div className="qt-center-group" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifySelf: 'end' }}>
            {encounter && (
              <div className="dojo-card-encounter">
                <span className="dojo-encounter-label" style={{ color: '#fff' }}>Encounter {encounter}/3</span>
                <span className="dojo-encounter-dots">{[0,1,2].map(i => <span key={i} className={`dojo-enc-dot ${i < encounter ? 'dojo-enc-dot-filled' : ''}`} />)}</span>
              </div>
            )}
            {onReportError && <button className="qt-report-error-btn" onClick={onReportError}>{'⚠'} Report Error</button>}
          </div>
        </div>
        <div className="qt-split">
          <div className="qt-split-left">
            <div className="qt-question-text" dangerouslySetInnerHTML={{ __html: q.text }} />
          </div>
          <div className="qt-split-divider" />
          <div className="qt-split-right">
            {hasPrompt && (
              <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />
            )}
            {!hasPrompt && <div className="dojo-q-statement-label">Select your answer</div>}
            <div className="qt-options">
              {q.options.map((opt, oi) => {
                if (!opt) return null
                let cls = 'qt-option'
                let radioCls = 'qt-option-radio'
                if (isAnswered) {
                  if (oi === q.correctIndex) { cls += ' qt-option-correct'; radioCls += ' qt-radio-correct' }
                  else if (oi === sel && res === 'incorrect') { cls += ' qt-option-wrong'; radioCls += ' qt-radio-wrong' }
                } else if (oi === sel) cls += ' qt-option-selected'
                return (
                  <button key={oi} className={cls} onClick={() => onSelect(oi)}>
                    <span className={radioCls} />
                    <span className="qt-option-text">{opt}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="qt-bottombar">
          <div className="qt-bottom-left">
            {onBack2 && <button className="qt-nav-btn qt-nav-back" onClick={onBack2} disabled={!onBack2}>&#9664; Back</button>}
            {leftContent}
          </div>
          <div className="qt-bottom-center">{centerContent}</div>
          <div className="qt-bottom-right">{rightContent}</div>
        </div>
      </div>
    )
  }

  function renderCardBack(onClick, count) {
    return (
      <div className="dojo-card-back" onClick={onClick}>
        <div className="dojo-card-back-inner">
          <div className="dojo-card-back-pattern" />
          {count != null && <span className="dojo-card-back-count">{count} cards in deck</span>}
          <span className="dojo-card-back-icon">?</span>
          <span className="dojo-card-back-label">Click to reveal</span>
        </div>
      </div>
    )
  }

  if (chaosMode) {
    return (
      <div className="dojo-page dojo-chaos">
        <div className="dojo-chaos-overlay" />
        {generatingClones ? (
          <div className="dojo-center-msg">
            <p className="pixel-heading dojo-chaos-title">SHADOW PRACTICE!</p>
            <div className="dojo-loading-spinner" />
            <p className="pixel-heading" style={{ fontSize: '0.7rem', color: '#ff4444', marginTop: 16 }}>Generating practice questions...</p>
          </div>
        ) : clones && clones[cloneIdx] ? (
          <div className="dojo-arena" style={{ width: '90%' }}>
            <div className="dojo-chaos-header">
              <span className="pixel-heading" style={{ fontSize: '0.8rem', color: '#ff4444' }}>Shadow Practice {cloneIdx + 1}/2</span>
            </div>
            <div className="dojo-deck-wrapper">
              <div className={`dojo-flip-container ${cloneFlipped ? 'dojo-flipped' : ''}`}>
                <div className="dojo-flip-inner">
                  <div className="dojo-flip-front">
                    {renderCardBack(() => setCloneFlipped(true), 2 - cloneIdx)}
                  </div>
                  <div className="dojo-flip-back">
                    {renderQuestionCard(
                      clones[cloneIdx], cloneSelected, cloneAnswered, cloneResult,
                      (oi) => { if (!cloneAnswered) setCloneSelected(oi) },
                      {
                        difficulty: clones[cloneIdx].difficulty,
                        leftContent: !cloneReported
                          ? <button className="dojo-report-btn" onClick={() => { reportDojoClone(currentCard.id, user.id, cloneIdx); setCloneReported(true) }}>Report</button>
                          : <span className="dojo-report-done">Reported</span>,
                        centerContent: cloneAnswered ? <span className={`dojo-feedback-text ${cloneResult === 'correct' ? 'dojo-fb-correct' : 'dojo-fb-wrong'}`}>{cloneResult === 'correct' ? 'Correct!' : 'Incorrect'}</span> : null,
                        rightContent: !cloneAnswered
                          ? <button className="qt-submit-btn" disabled={cloneSelected === -1} onClick={handleCloneSubmit}>Submit</button>
                          : <button className="qt-nav-btn qt-nav-next" onClick={nextClone}>{cloneIdx < 1 ? 'Next' : 'Finish'} &#9654;</button>,
                        onReportError: () => setReportOpen({ sourceId: currentCard?.sourceId, qIndex: currentCard?.questionIndex || 0, question: currentCard?.question, questionId: currentCard?.questionId })
                      }
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`dojo-page${bgReady ? ' dojo-bg-ready' : ' dojo-bg-loading'}`}
      style={{ background: `url("${bgReady ? wallpaper.src : wallpaper.placeholder}") center / cover no-repeat` }}>
      {!bgReady && (
        <div className="dojo-bg-loader">
          <div className="dojo-loading-spinner" />
          <p className="dojo-bg-loader-text">Entering the Dojo…</p>
        </div>
      )}

      <div className="dojo-inner">
        <div className="dojo-header-bar">
          <button className="dojo-back-btn" onClick={onBack}>&#9664; Back</button>
          <span className="dojo-title">Revision Dojo</span>
          <div className="dojo-header-right">
            {kills > 0 && <button className="dojo-redeem-btn" onClick={handleRedeem}>Redeem {kills * 5}t</button>}
          </div>
        </div>

        <div className="dojo-tabs">
          <button className={`dojo-tab ${tab === 'training' ? 'dojo-tab-active' : ''}`} onClick={() => { setTab('training'); setAskViewCard(null) }} style={{ position: 'relative' }}>
            Training
            {dueCards.length > 0 && <span className="dojo-tab-badge dojo-tab-badge-yellow">{dueCards.length}</span>}
          </button>
          <button className={`dojo-tab ${tab === 'ask' ? 'dojo-tab-active' : ''}`} onClick={() => { setTab('ask'); setAskViewCard(null) }} style={{ position: 'relative' }}>
            Ask for Help
            {askTeacherCards.length > 0 && <span className="dojo-tab-badge dojo-tab-badge-red">{askTeacherCards.length}</span>}
          </button>
          <button className={`dojo-tab ${tab === 'endless' ? 'dojo-tab-active' : ''}`} onClick={() => { setTab('endless'); setEndlessBuilding(true) }}>
            Endless Practice
          </button>
          <button className={`dojo-tab ${tab === 'archive' ? 'dojo-tab-active' : ''}`} onClick={() => { setTab('archive'); if (archivedCards.length > 0) setArchiveDeck(shuffleArray(archivedCards)); setArchiveIdx(0); setArchiveSel(-1); setArchiveAnswered(false); setArchiveResult(null); setArchiveFlipped(false) }}>
            Archive
          </button>
        </div>

        <div className="dojo-total-box">{allCards.length + archivedCards.length} question{allCards.length + archivedCards.length !== 1 ? 's' : ''} stored</div>

        {showKillAnim && (
          <div className="dojo-kill-flash">
            <span className="pixel-heading" style={{ fontSize: '2rem', color: '#00e676' }}>ARCHIVED!</span>
          </div>
        )}

        {dojoClearedBanner !== null && (
          <div className="dojo-cleared-banner">
            <span className="dojo-cleared-icon">&#9876;</span>
            <p className="pixel-heading dojo-cleared-title">DOJO CLEARED!</p>
            <p className="dojo-cleared-reward">Reward: {dojoClearedBanner} tokens</p>
          </div>
        )}

        {/* ===== TRAINING TAB ===== */}
        {tab === 'training' && (<>
          {dueCards.length === 0 ? (
            <div className="dojo-empty">
              <span className="dojo-empty-icon">🕯️</span>
              <p className="dojo-empty-title">The hall is quiet...</p>
              <p className="dojo-empty-sub">{allCards.length > 0 ? (() => {
                const nextDate = allCards.filter(c => c.nextReviewDate).map(c => new Date(c.nextReviewDate)).sort((a, b) => a - b)[0]
                if (nextDate) {
                  const days = Math.max(0, Math.ceil((nextDate - Date.now()) / (1000 * 60 * 60 * 24)))
                  return days === 0 ? 'Your questions are ready — refresh the page!' : `Next encounter in ${days} day${days !== 1 ? 's' : ''}.`
                }
                return 'Your questions are resting. Come back later!'
              })() : 'Incorrect quiz answers will appear here for revision.'}</p>
            </div>
          ) : currentCard ? (
            <div className="dojo-arena">
              <div className="dojo-deck-count">Card {currentIdx + 1} of {dueCards.length} · {remaining} remaining</div>
              <div className="dojo-deck-wrapper">
                <div className={`dojo-flip-container ${cardFlipped ? 'dojo-flipped' : ''}`}>
                  <div className="dojo-flip-inner">
                    <div className="dojo-flip-front">
                      {renderCardBack(() => setCardFlipped(true), remaining)}
                    </div>
                    <div className="dojo-flip-back">
                      {renderQuestionCard(
                        currentCard.question, selectedAnswer, answered, result,
                        (oi) => { if (!answered) setSelectedAnswer(oi) },
                        {
                          source: [currentCard.className, currentCard.courseName, currentCard.quizTitle].filter(Boolean).join(' · '),
                          sourceId: currentCard.sourceId,
                          encounter: currentCard.correctStreak + 1,
                          leftContent: !answered
                            ? <button className="qt-action-btn-left" onClick={() => { markDojoAskTeacher(currentCard.id); nextCard() }}>Ask for Help</button>
                            : null,
                          centerContent: answered
                            ? <span className={`dojo-feedback-text ${result === 'correct' ? 'dojo-fb-correct' : 'dojo-fb-wrong'}`}>
                                {result === 'correct' ? currentCard.correctStreak >= 3 ? 'Mastered! +5 tokens' : `Correct! ${currentCard.correctStreak}/3` : 'Incorrect. Streak reset.'}
                              </span>
                            : null,
                          rightContent: !answered
                            ? <button className="qt-submit-btn" disabled={selectedAnswer === -1} onClick={handleSubmitAnswer}>Submit</button>
                            : result === 'correct' ? <button className="qt-nav-btn qt-nav-next" onClick={nextCard}>Next &#9654;</button>
                            : !chaosMode ? <span className="dojo-feedback-sub">Entering Shadow Practice...</span> : null,
                          onReportError: () => setReportOpen({ sourceId: currentCard?.sourceId, qIndex: currentCard?.questionIndex || 0, question: currentCard?.question, questionId: currentCard?.questionId })
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="dojo-upload-banner">
            <div className="dojo-upload-banner-icon">📷</div>
            <div className="dojo-upload-banner-text">
              <p className="dojo-upload-banner-title">Upload Your Own Questions</p>
              <p className="dojo-upload-banner-sub">Snap a photo or drag and drop an image of a worksheet, textbook page, or past paper to add it to your revision deck.</p>
            </div>
            <button className="dojo-upload-banner-btn" onClick={() => setUploadOpen(true)}>Upload</button>
          </div>
        </>)}

        {/* ===== ASK FOR HELP TAB ===== */}
        {tab === 'ask' && (
          askViewCard ? (
            <div className="dojo-arena">
              {renderQuestionCard(
                askViewCard.question, askSel, askAnswered, askResult,
                (oi) => { if (!askAnswered) setAskSel(oi) },
                {
                  source: [askViewCard.className, askViewCard.courseName, askViewCard.quizTitle].filter(Boolean).join(' · '),
                  sourceId: askViewCard.sourceId,
                  centerContent: askAnswered ? <span className={`dojo-feedback-text ${askResult === 'correct' ? 'dojo-fb-correct' : 'dojo-fb-wrong'}`}>
                      {askResult === 'correct' ? 'Correct!' : 'Incorrect'}
                    </span> : null,
                  leftContent: !askAnswered
                    ? <button className="qt-action-btn-left" onClick={() => { returnDojoCardToTraining(askViewCard.id); setAskViewCard(null); setRefresh(r => r + 1) }}>Add Back to Training</button>
                    : null,
                  rightContent: !askAnswered
                    ? <button className="qt-submit-btn" disabled={askSel === -1} onClick={handleAskSubmit}>Submit</button>
                    : <button className="qt-nav-btn qt-nav-next" onClick={() => setAskViewCard(null)}>Back to list &#9654;</button>,
                  onBack: () => setAskViewCard(null),
                  onReportError: () => setReportOpen({ sourceId: askViewCard?.sourceId, qIndex: askViewCard?.questionIndex || 0, question: askViewCard?.question, questionId: askViewCard?.questionId })
                }
              )}
            </div>
          ) : (
            <div className="dojo-list">
              {askTeacherCards.length === 0 ? (
                <div className="dojo-empty">
                  <span className="dojo-empty-icon">✅</span>
                  <p className="dojo-empty-sub">No questions need help right now.</p>
                </div>
              ) : askTeacherCards.map(card => (
                <div key={card.id} className="dojo-list-card dojo-list-card-clickable" onClick={() => handleAskCardClick(card)}>
                  {(card.className || card.courseName || card.quizTitle) && (
                    <div className="dojo-list-source">{[card.className, card.courseName, card.quizTitle].filter(Boolean).join(' · ')}</div>
                  )}
                  <div className="dojo-list-q" dangerouslySetInnerHTML={{ __html: card.question.prompt || card.question.text }} />
                  <div className="dojo-list-meta">
                    <span>Tap to practice</span>
                    <span>{new Date(card.firstIncorrectDate).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ===== ENDLESS PRACTICE TAB ===== */}
        {tab === 'endless' && (
          endlessBuilding ? (() => {
            const topics = getDojoTopics(user.id)
            const topicKeys = Object.keys(topics)
            const allCount = Object.values(topics).reduce((s, n) => s + n, 0)
            const availableCount = endlessTopic === 'all' ? allCount : (topics[endlessTopic] || 0)
            return (
              <div className="dojo-endless-layout">
                <div className="dojo-session-builder">
                  <div className="dojo-session-header">
                    <span className="dojo-session-icon">🃏</span>
                    <p className="dojo-session-title">Build Your Session</p>
                    <p className="dojo-session-sub">Choose a subject and deck size, then hit go.</p>
                  </div>

                  {allCount === 0 ? (
                    <div className="dojo-session-empty">
                      <p className="dojo-empty-sub">No cards yet — incorrect quiz answers will appear here.</p>
                    </div>
                  ) : (
                    <div className="dojo-session-body">
                      <div className="dojo-session-section">
                        <p className="dojo-session-label">Subject</p>
                        <div className="dojo-session-pills">
                          <button className={`dojo-session-pill ${endlessTopic === 'all' ? 'dojo-session-pill-active' : ''}`} onClick={() => setEndlessTopic('all')}>
                            All ({allCount})
                          </button>
                          {topicKeys.map(t => (
                            <button key={t} className={`dojo-session-pill ${endlessTopic === t ? 'dojo-session-pill-active' : ''}`} onClick={() => setEndlessTopic(t)}>
                              {t} ({topics[t]})
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="dojo-session-section">
                        <p className="dojo-session-label">Deck Size</p>
                        <div className="dojo-session-counts">
                          {[5, 10].filter(n => n <= availableCount).map(n => (
                            <button key={n} className={`dojo-session-count ${endlessCount === n ? 'dojo-session-count-active' : ''}`} onClick={() => setEndlessCount(n)}>
                              {n} cards
                            </button>
                          ))}
                          <button className={`dojo-session-count ${endlessCount === availableCount ? 'dojo-session-count-active' : ''}`} onClick={() => setEndlessCount(availableCount)}>
                            All ({availableCount})
                          </button>
                        </div>
                      </div>

                      <div className="dojo-session-actions">
                        <button className="dojo-session-go" onClick={startEndlessSession} disabled={availableCount === 0}>
                          Let's Go!
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="dojo-endless-or">
                  <div className="dojo-endless-or-line" />
                  <span className="dojo-endless-or-text">OR</span>
                  <div className="dojo-endless-or-line" />
                </div>

                <div className="dojo-upload-section">
                  <span className="dojo-upload-section-icon">📷</span>
                  <p className="dojo-upload-section-title">Upload Your Own Questions</p>
                  <p className="dojo-upload-section-sub">Add custom questions from photos of worksheets, textbooks, or past papers — or drag and drop an image here!</p>
                  <button className="dojo-upload-section-btn" onClick={() => setUploadOpen(true)}>📷 Upload Questions</button>
                </div>
              </div>
            )
          })()
          : endlessDeck.length === 0 ? (
            <div className="dojo-empty">
              <span className="dojo-empty-icon">🃏</span>
              <p className="dojo-empty-title">No matching cards</p>
              <p className="dojo-empty-sub">Try a different subject or add more questions.</p>
              <button className="dojo-topbar-btn dojo-topbar-shuffle" style={{ marginTop: 12 }} onClick={() => setEndlessBuilding(true)}>← Back to Session Builder</button>
            </div>
          ) : (
            <div className="dojo-arena">
              <div className="dojo-archive-topbar">
                <span className="dojo-progress-label">Card {endlessIdx + 1} of {endlessDeck.length}{endlessTopic !== 'all' ? ` · ${endlessTopic}` : ''}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="dojo-topbar-btn dojo-topbar-shuffle" onClick={() => setEndlessBuilding(true)}>← New Session</button>
                  <button className={`dojo-topbar-btn dojo-topbar-shuffle ${shuffling ? 'dojo-shuffling' : ''}`} onClick={() => { setShuffling(true); setTimeout(() => { initEndless(); setShuffling(false) }, 400) }} disabled={shuffling}>
                    🔀 Shuffle
                  </button>
                  <button className="dojo-topbar-btn dojo-topbar-upload" onClick={() => setUploadOpen(true)}>📷 Upload</button>
                </div>
              </div>

              <div className={`dojo-deck-wrapper ${shuffling ? 'dojo-deck-shuffling' : ''}`}>
                <div className={`dojo-flip-container ${endlessFlipped ? 'dojo-flipped' : ''}`}>
                  <div className="dojo-flip-inner">
                    <div className="dojo-flip-front">
                      {renderCardBack(handleEndlessFlip, endlessDeck.length - endlessIdx)}
                    </div>
                    <div className="dojo-flip-back">
                      {endlessDeck[endlessIdx] && renderQuestionCard(
                        endlessDeck[endlessIdx].question, endlessSel, endlessAnswered, endlessResult,
                        (oi) => { if (!endlessAnswered) setEndlessSel(oi) },
                        {
                          source: [endlessDeck[endlessIdx].className, endlessDeck[endlessIdx].topic, endlessDeck[endlessIdx].courseName, endlessDeck[endlessIdx].quizTitle].filter(Boolean).join(' · ') || 'My Questions',
                          sourceId: endlessDeck[endlessIdx].sourceId,
                          centerContent: endlessAnswered ? <span className={`dojo-feedback-text ${endlessResult === 'correct' ? 'dojo-fb-correct' : 'dojo-fb-wrong'}`}>
                              {endlessResult === 'correct' ? 'Correct!' : 'Incorrect'}
                            </span> : null,
                          rightContent: !endlessAnswered
                            ? <button className="qt-submit-btn" disabled={endlessSel === -1} onClick={handleEndlessSubmit}>Submit</button>
                            : <div style={{ display: 'flex', gap: 8 }}>
                                <button className="dojo-endless-archive-btn" onClick={handleEndlessArchive} title="Send to archive">📦 Send to Archive</button>
                                <button className="qt-nav-btn qt-nav-next" onClick={nextEndlessCard}>Next &#9654;</button>
                              </div>,
                          onReportError: () => setReportOpen({ sourceId: endlessDeck[endlessIdx]?.sourceId, qIndex: endlessDeck[endlessIdx]?.questionIndex || 0, question: endlessDeck[endlessIdx]?.question, questionId: endlessDeck[endlessIdx]?.questionId })
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ===== ARCHIVED TAB ===== */}
        {tab === 'archive' && (() => {
          const filtered = archivedCards.filter(c => {
            if (!archiveSearch) return true
            const s = archiveSearch.toLowerCase()
            const qText = (c.question?.text || c.question?.prompt || '').toLowerCase()
            const origin = [c.topic, c.courseName, c.quizTitle].filter(Boolean).join(' ').toLowerCase()
            return qText.includes(s) || origin.includes(s)
          })
          return archivedCards.length === 0 ? (
            <div className="dojo-empty">
              <span className="dojo-empty-icon">🏆</span>
              <p className="dojo-empty-sub">No archived questions yet. Keep training!</p>
            </div>
          ) : (
            <div className="dojo-archive-list">
              <div className="dojo-archive-topbar">
                <span className="dojo-progress-label">{filtered.length} archived question{filtered.length !== 1 ? 's' : ''}</span>
                <input
                  type="text"
                  className="dojo-archive-search"
                  placeholder="Search questions..."
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                />
              </div>
              <div className="dojo-archive-table">
                <div className="dojo-archive-thead">
                  <span className="dojo-archive-th dojo-archive-th-q">Question</span>
                  <span className="dojo-archive-th dojo-archive-th-origin">Origin</span>
                  <span className="dojo-archive-th dojo-archive-th-topic">Topic</span>
                  <span className="dojo-archive-th dojo-archive-th-date">Archived</span>
                  <span className="dojo-archive-th dojo-archive-th-action"></span>
                </div>
                {filtered.map(card => {
                  const qText = card.question?.text || card.question?.prompt || 'Question'
                  const preview = qText.length > 80 ? qText.slice(0, 80) + '…' : qText
                  const origin = [card.className, card.courseName, card.quizTitle].filter(Boolean).join(' · ') || (card.custom ? 'Uploaded' : '—')
                  const topic = card.topic || '—'
                  const dateStr = card.archivedDate ? new Date(card.archivedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
                  return (
                    <div key={card.id} className="dojo-archive-trow dojo-archive-trow-clickable" onClick={() => { setArchiveViewCard(card); setArchiveViewSel(-1); setArchiveViewAnswered(false) }}>
                      <span className="dojo-archive-td dojo-archive-td-q" title={qText}>{preview}</span>
                      <span className="dojo-archive-td dojo-archive-td-origin">{origin}</span>
                      <span className="dojo-archive-td dojo-archive-td-topic">{topic}</span>
                      <span className="dojo-archive-td dojo-archive-td-date">{dateStr}</span>
                      <span className="dojo-archive-td dojo-archive-td-action">
                        <button className="dojo-archive-restore-btn" onClick={(e) => { e.stopPropagation(); handleUnarchive(card.id) }}>♻️ Restore</button>
                      </span>
                    </div>
                  )
                })}
                {filtered.length === 0 && archiveSearch && (
                  <div className="dojo-archive-trow" style={{ justifyContent: 'center', opacity: 0.5 }}>
                    <span>No results for "{archiveSearch}"</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {archiveViewCard && (() => {
        const q = archiveViewCard.question
        const origin = [archiveViewCard.className, archiveViewCard.courseName, archiveViewCard.quizTitle].filter(Boolean).join(' · ')
        return (
          <div className="neon-overlay" onClick={() => setArchiveViewCard(null)}>
            <div className="dojo-archive-view-modal" onClick={e => e.stopPropagation()}>
              <div className="qt-panel" style={{ borderRadius: 16, overflow: 'hidden' }}>
                <div className="qt-topbar" style={{ padding: '12px 24px' }}>
                  <div className="qt-timer-area">
                    {origin && <span style={{ color: '#fff', fontSize: '0.85rem' }}>{origin}</span>}
                  </div>
                  <div className="qt-center-group" />
                  <div style={{ justifySelf: 'end' }}>
                    <button className="dojo-archive-view-close" onClick={() => setArchiveViewCard(null)} style={{ color: '#fff' }}>✕</button>
                  </div>
                </div>
                <div className="qt-split">
                  <div className="qt-split-left">
                    {q.text && <div className="qt-question-text" dangerouslySetInnerHTML={{ __html: q.text }} />}
                  </div>
                  <div className="qt-split-divider" />
                  <div className="qt-split-right">
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    {!q.prompt && <div className="dojo-q-statement-label">Select your answer</div>}
                    <div className="qt-options">
                      {(q.options || []).map((opt, oi) => {
                        if (!opt) return null
                        let cls = 'qt-option'
                        let radioCls = 'qt-option-radio'
                        if (archiveViewAnswered) {
                          if (oi === q.correctIndex) { cls += ' qt-option-correct'; radioCls += ' qt-radio-correct' }
                          else if (oi === archiveViewSel) { cls += ' qt-option-wrong'; radioCls += ' qt-radio-wrong' }
                        } else if (oi === archiveViewSel) cls += ' qt-option-selected'
                        return (
                          <button key={oi} className={cls} onClick={() => { if (!archiveViewAnswered) setArchiveViewSel(oi) }}>
                            <span className={radioCls} />
                            <span className="qt-option-text">{opt}</span>
                          </button>
                        )
                      })}
                    </div>
                    {!archiveViewAnswered && archiveViewSel !== -1 && (
                      <button className="qt-submit-btn" style={{ marginTop: 12 }} onClick={() => setArchiveViewAnswered(true)}>Check Answer</button>
                    )}
                    {archiveViewAnswered && (
                      <div style={{ marginTop: 12, textAlign: 'center' }}>
                        <span className={archiveViewSel === q.correctIndex ? 'dojo-fb-correct' : 'dojo-fb-wrong'} style={{ fontWeight: 600 }}>
                          {archiveViewSel === q.correctIndex ? 'Correct!' : 'Incorrect'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {uploadOpen && (
        <div className="dojo-upload-overlay" onClick={() => { setUploadOpen(false); setUploadImg(null); setUploadPreview(null) }}>
          <div className="dojo-upload-modal" onClick={e => e.stopPropagation()} tabIndex={-1}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!uploadImg) setDragActive(true) }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (!uploadImg) { const f = e.dataTransfer.files?.[0]; if (f) processImageFile(f) } }}
            onPaste={e => { if (uploadImg) return; const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (item) { e.preventDefault(); processImageFile(item.getAsFile()) } }}
          >
            <button className="bg-profile-close" onClick={() => { setUploadOpen(false); setUploadImg(null); setUploadPreview(null) }}>✕</button>
            <div className="dojo-upload-title">Upload a Question</div>
            <p className="dojo-upload-sub">Take a photo of a question from your textbook — AI will convert it into a revision card.</p>

            {!uploadImg && (
              <label
                className={`dojo-upload-drop${dragActive ? ' dojo-upload-drag-active' : ''}`}
                onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }}
                onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) processImageFile(f) }}
              >
                <span style={{ fontSize: '2rem' }}>📷</span>
                <span>{dragActive ? 'Drop your image here' : 'Tap, drag, or paste an image here'}</span>
                <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} hidden />
              </label>
            )}

            {uploadImg && !uploadPreview && uploadProcessing && (
              <div className="dojo-upload-processing">
                <div className="bg-trivia-spinner" />
                <span>Processing your question...</span>
              </div>
            )}

            {uploadImg && (
              <img src={uploadImg} alt="Uploaded" className="dojo-upload-preview-img" />
            )}

            {uploadPreview && (
              <div className="dojo-upload-result">
                <div className="dojo-upload-q">{uploadPreview.text}</div>
                <div className="dojo-upload-options">
                  {uploadPreview.options.map((opt, i) => (
                    <div key={i} className={`dojo-upload-opt ${i === uploadPreview.correctIndex ? 'dojo-upload-opt-correct' : ''}`}>
                      <span className="dojo-upload-opt-letter">{String.fromCharCode(65 + i)}</span>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
                <div className="dojo-upload-topic">
                  <label className="dojo-upload-topic-label">Tag a Subject</label>
                  <input
                    type="text"
                    className="dojo-upload-topic-input"
                    placeholder="e.g. Mathematics, Reading, Thinking Skills"
                    value={uploadTopic}
                    onChange={e => setUploadTopic(e.target.value)}
                    list="dojo-topic-suggestions"
                  />
                  <datalist id="dojo-topic-suggestions">
                    {Object.keys(getDojoTopics(user.id)).filter(t => t !== 'Uncategorised').map(t => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
                  <button className="btn btn-outline" onClick={() => { setUploadImg(null); setUploadPreview(null) }}>Retake</button>
                  <button className="btn" onClick={handleConfirmUpload}>Add to Dojo</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reportOpen && (
        <ReportIssueModal
          kind="question"
          question={reportOpen.question}
          onClose={() => setReportOpen(null)}
          onSubmit={({ type, details, option }) => {
            reportQuestionError(reportOpen.sourceId || '', reportOpen.qIndex || 0, user.id, type, details, { source: 'dojo', option, questionId: reportOpen.questionId })
          }}
        />
      )}
    </div>
  )
}

export default RevisionDojo
