/**
 * Pure helpers for the safe-upgrade check: feed parsing, the runtime version
 * probe, and the same plugin/runtime compatibility rule the host applies when
 * it loads a profile (`engines.dsh` decides alone, otherwise every
 * `@deepseek-ai/dsh*` peer must match, prereleases participate).
 */
import { existsSync } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const FEED_URL = 'https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml'

const WORKSPACE_RANGES = ['workspace:^', 'workspace:~', 'workspace:*']

/* ------------------------------------------------------------------ semver */

function parse(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim())
  if (m === null) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] === undefined ? [] : m[4].split('.') }
}

function compareIdentifier(a, b) {
  const numericA = /^\d+$/.test(a)
  const numericB = /^\d+$/.test(b)
  if (numericA && numericB) return Math.sign(+a - +b)
  if (numericA) return -1
  if (numericB) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

export function compare(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key])
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    if (index >= left.pre.length) return -1
    if (index >= right.pre.length) return 1
    const order = compareIdentifier(left.pre[index], right.pre[index])
    if (order !== 0) return order
  }
  return 0
}

function bump(version, part) {
  if (part === 'major') return { major: version.major + 1, minor: 0, patch: 0, pre: [] }
  if (part === 'minor') return { major: version.major, minor: version.minor + 1, patch: 0, pre: [] }
  return { major: version.major, minor: version.minor, patch: version.patch + 1, pre: [] }
}

/** Expand one whitespace-free comparator into its lower and upper bounds. */
function comparators(range) {
  const out = []
  const token = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/
  for (const raw of range.split(/\s+/).filter((part) => part !== '')) {
    const match = token.exec(raw)
    const operator = match[1] ?? ''
    const body = match[2]
    const parts = body.split('.')
    const wildcard = parts.findIndex((part) => /^[*xX]$/.test(part))
    if (wildcard >= 0) {
      const major = wildcard === 0 ? 0 : Number(parts[0])
      const minor = wildcard <= 1 ? 0 : Number(parts[1])
      const base = { major, minor, patch: 0, pre: [] }
      const upper = wildcard === 0
        ? { major: 1, minor: 0, patch: 0, pre: [] }
        : wildcard === 1
          ? { major: major + 1, minor: 0, patch: 0, pre: [] }
          : { major, minor: minor + 1, patch: 0, pre: [] }
      out.push(['>=', base], ['<', upper])
      continue
    }
    const version = parse(body)
    if (version === null) throw new Error(`unparsable range ${JSON.stringify(raw)}`)
    if (operator === '^') {
      const upper = version.major === 0
        ? (version.minor === 0 ? bump(version, 'patch') : bump(version, 'minor'))
        : bump(version, 'major')
      out.push(['>=', version], ['<', upper])
    } else if (operator === '~') {
      out.push(['>=', version], ['<', bump(version, 'minor')])
    } else {
      out.push([operator === '' ? '=' : operator, version])
    }
  }
  return out
}

function holds(version, operator, bound) {
  const order = compare(version, bound)
  if (operator === '=') return order === 0
  if (operator === '>') return order > 0
  if (operator === '>=') return order >= 0
  if (operator === '<') return order < 0
  return order <= 0
}

/** `semver.satisfies(version, range, { includePrerelease: true })`. */
export function satisfies(version, range) {
  const parsed = parse(version)
  if (parsed === null) throw new Error(`invalid version ${JSON.stringify(version)}`)
  return range
    .split('||')
    .some((alternative) => comparators(alternative.trim()).every(([operator, bound]) => holds(parsed, operator, bound)))
}

/** `semver.compare`, or undefined when either version cannot be parsed. */
export function compareVersions(left, right) {
  const a = parse(left)
  const b = parse(right)
  if (a === null || b === null) return undefined
  return compare(a, b)
}

/* ------------------------------------------------------- compatibility rule */

/** Unmet dsh requirements of one manifest against `target`; empty means compatible. */
export function unmetRequirements(manifest, target) {
  const engines = manifest.engines !== null && typeof manifest.engines === 'object' ? manifest.engines : {}
  if (Object.hasOwn(engines, 'dsh')) {
    const range = engines.dsh
    if (typeof range !== 'string' || !satisfies(target, range)) return { 'engines.dsh': String(range) }
    return {}
  }
  const unmet = {}
  const peers = manifest.peerDependencies ?? {}
  for (const [name, range] of Object.entries(peers)) {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
    if (typeof range !== 'string') continue
    if (!satisfies(target, WORKSPACE_RANGES.includes(range) ? target : range)) unmet[name] = range
  }
  return unmet
}

/* ------------------------------------------------------------- feed access */

export async function fetchTarget(feedUrl = FEED_URL) {
  const response = await fetch(feedUrl, { redirect: 'follow' })
  if (!response.ok) throw new Error(`update feed answered ${response.status}`)
  const text = await response.text()
  const version = /^version:\s*'?"?([0-9][^\s'"]*)/m.exec(text)
  if (version === null) throw new Error('update feed carries no version')
  const releaseDate = /^releaseDate:\s*'?"?([^'"\s]+)/m.exec(text)
  return { version: version[1], releaseDate: releaseDate === null ? undefined : releaseDate[1], feedUrl }
}

/* --------------------------------------------------------- runtime version */

async function readAsarEntry(archive, entryPath) {
  const handle = await open(archive, 'r')
  try {
    const head = Buffer.alloc(16)
    await handle.read(head, 0, 16, 0)
    const headerSize = head.readUInt32LE(4)
    const jsonLength = head.readUInt32LE(12)
    const headerBuffer = Buffer.alloc(jsonLength)
    await handle.read(headerBuffer, 0, jsonLength, 16)
    let node = JSON.parse(headerBuffer.toString('utf8'))
    for (const segment of entryPath) {
      node = node?.files?.[segment]
      if (node === undefined) return undefined
    }
    if (node.link !== undefined) return undefined
    const size = Number(node.size)
    const data = Buffer.alloc(size)
    await handle.read(data, 0, size, 8 + headerSize + Number(node.offset))
    return data.toString('utf8')
  } finally {
    await handle.close()
  }
}

/** The running desktop package version, or undefined when it cannot be read. */
export async function detectRuntimeVersion() {
  if (typeof process.env.DSH_VERSION === 'string' && process.env.DSH_VERSION !== '') {
    return { version: process.env.DSH_VERSION, source: 'environment' }
  }
  const resources = process.resourcesPath ?? join(dirname(process.execPath), 'resources')
  const archive = [join(resources, 'app.asar')]
    .concat((process.argv ?? []).filter((argument) => typeof argument === 'string' && argument.toLowerCase().endsWith('.asar')))
    .find((candidate) => existsSync(candidate))
  if (archive === undefined) return { version: undefined, source: 'unavailable' }
  try {
    const manifest = await readAsarEntry(archive, ['dsh', 'package.json'])
    if (manifest === undefined) return { version: undefined, source: 'unavailable' }
    return { version: JSON.parse(manifest).version, source: 'application archive' }
  } catch {
    return { version: undefined, source: 'unavailable' }
  }
}

/* ------------------------------------------------------- profile inventory */

export async function readProfileManifest(profileDir) {
  const raw = await readFile(join(profileDir, 'package.json'), 'utf8')
  return JSON.parse(raw)
}

export async function readPluginManifest(profileDir, name) {
  try {
    return JSON.parse(await readFile(join(profileDir, 'node_modules', name, 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Evaluate the profile's installed plugins against `target`.
 * @param profileDir - the desktop profile directory.
 * @param names - package names to evaluate (the caller decides what is enabled).
 * @param target - the version the harness would run after the update.
 */
export async function evaluateProfile(profileDir, names, target) {
  const plugins = []
  for (const name of names) {
    const manifest = await readPluginManifest(profileDir, name)
    if (manifest === undefined) {
      plugins.push({ name, installed: false, compatible: false, version: undefined, unmet: {} })
      continue
    }
    let unmet = {}
    try {
      unmet = unmetRequirements(manifest, target)
    } catch {
      unmet = { manifest: 'requirements cannot be parsed' }
    }
    plugins.push({
      name,
      installed: true,
      version: manifest.version,
      compatible: Object.keys(unmet).length === 0,
      unmet,
    })
  }
  return plugins
}
