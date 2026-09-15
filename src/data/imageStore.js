import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { app } from './firebase.js'

// Legacy local store: still read so any old idb:// pointers keep resolving in
// the browser that holds them, but nothing new is written here.
const DB_NAME = 'leaderboard_images'
const STORE_NAME = 'images'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}


export async function storeImage(key, dataUri) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(dataUri, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getImage(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteImages(keys) {
  if (!keys || keys.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const key of keys) store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getImageCount() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ============================================================
// CLOUD IMAGE STORAGE
//
// Images used to be pulled out of imported quiz HTML and saved into the
// importing browser's IndexedDB, leaving `idb://` pointers in the question
// text. Those pointers resolve only in that one browser profile, so every other
// device - including every student - saw broken images.
//
// Images now go to Firebase Storage and the question keeps a normal https URL:
//   - downscaled to IMAGE_MAX_DIM and re-encoded as WebP (typically 5-10x
//     smaller than the PDF-extracted PNGs)
//   - named by SHA-256 of the encoded bytes, so an image reused across
//     questions or re-imports is stored once, and the object behind a URL never
//     changes - which is what makes a year-long immutable cache header safe
//   - tagged loading="lazy" so a long quiz only fetches images as they scroll in
// ============================================================
const IMAGE_MAX_DIM = 1600
const WEBP_QUALITY = 0.85
const STORAGE_PREFIX = 'quiz-images'

let _storage = null
function storage() {
  if (!_storage) _storage = getStorage(app)
  return _storage
}

async function dataUriToBlob(dataUri) {
  const res = await fetch(dataUri)
  return res.blob()
}

/** Downscales and re-encodes raster images to WebP; passes vector/animated through. */
async function optimiseImage(blob) {
  if (/svg|gif/.test(blob.type)) return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY))
    // Keep whichever is smaller - tiny PNG diagrams can beat their WebP version.
    return webp && webp.size < blob.size ? webp : blob
  } catch {
    return blob
  }
}

async function sha256Hex(blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function extensionFor(type) {
  if (type.includes('webp')) return 'webp'
  if (type.includes('png')) return 'png'
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'
  if (type.includes('gif')) return 'gif'
  if (type.includes('svg')) return 'svg'
  return 'bin'
}

/** Uploads one data URI and returns its public download URL. */
async function uploadDataUri(dataUri) {
  const optimised = await optimiseImage(await dataUriToBlob(dataUri))
  const hash = await sha256Hex(optimised)
  const path = `${STORAGE_PREFIX}/${hash}.${extensionFor(optimised.type)}`
  const objectRef = ref(storage(), path)
  try {
    // Content-addressed: if it already exists, it is byte-identical.
    return await getDownloadURL(objectRef)
  } catch {
    await uploadBytes(objectRef, optimised, {
      contentType: optimised.type,
      cacheControl: 'public, max-age=31536000, immutable',
    })
    return getDownloadURL(objectRef)
  }
}

/**
 * Uploads one picture (a File/Blob from an <input type="file">, or a data URI)
 * to cloud storage and returns its https URL. Use this for course, class and
 * logo images: storing a data URI in shared data makes a ~150-400 KB record
 * field, and those records have a 1 MiB cap.
 */
export async function uploadImage(fileOrDataUri) {
  const dataUri = typeof fileOrDataUri === 'string'
    ? fileOrDataUri
    : await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(fileOrDataUri)
    })
  return uploadDataUri(dataUri)
}

/** Adds lazy loading / async decoding to img tags that do not set it. */
function lazyLoadImages(html) {
  return html.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"')
}

/**
 * Moves every inline image in a piece of question HTML to cloud storage and
 * returns the HTML with https URLs in their place.
 *
 * Name kept for the existing import call sites; it no longer stores anything
 * locally.
 */
export async function extractAndStoreImages(html) {
  if (!html) return html
  const matches = [...new Set([...html.matchAll(/(data:image\/[^"'\s)]+)/g)].map((m) => m[1]))]
  let result = html
  for (const dataUri of matches) {
    if (dataUri.length < 100) continue
    try {
      const url = await uploadDataUri(dataUri)
      result = result.split(dataUri).join(url)
    } catch (e) {
      // Leave the image inline rather than lose it; it still displays, it is
      // just heavier. Most likely cause is a missing teacher auth session.
      console.error('Image upload failed; keeping it inline:', e)
    }
  }
  return lazyLoadImages(result)
}

export async function resolveImages(html) {
  if (!html || !html.includes('idb://')) return html
  const regex = /idb:\/\/(img-[a-z0-9-]+)/g
  const matches = [...html.matchAll(regex)]
  if (matches.length === 0) return html

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  const results = await Promise.all(
    matches.map((m) => new Promise((resolve) => {
      const req = store.get(m[1])
      req.onsuccess = () => resolve({ ref: m[0], dataUri: req.result })
      req.onerror = () => resolve({ ref: m[0], dataUri: null })
    }))
  )

  let resolved = html
  for (const { ref, dataUri } of results) {
    if (dataUri) resolved = resolved.replace(ref, dataUri)
  }
  return resolved
}

export function findImageRefs(html) {
  if (!html) return []
  const regex = /idb:\/\/(img-[a-z0-9-]+)/g
  return [...html.matchAll(regex)].map((m) => m[1])
}
