/**
 * Host half of the safe-upgrade bundle: tells the button whether the next
 * harness release accepts every enabled plugin, and can turn off the bundles
 * that release would refuse to load. The Client module owns the UI.
 */
import { compareVersions, detectRuntimeVersion, evaluateProfile, fetchTarget, FEED_URL } from './core.js'

export const name = 'safe-upgrade'
export const inject = ['pluginManager', 'webServer']

const API = '/safe-upgrade/api'

function send(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

async function readBody(request, limit = 64 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (total === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function apply(ctx, config = {}) {
  const feedUrl = typeof config.feedUrl === 'string' && config.feedUrl !== '' ? config.feedUrl : FEED_URL
  const profileDir = () => process.env.DSH_PROFILE_DIR ?? ctx.profileContext?.dir

  /**
   * Bundles this profile would load at startup, minus the in-box layers, and
   * the running version the in-box base bundle declares.
   */
  const profileState = async () => {
    const bundles = await ctx.pluginManager.listBundles()
    const base = bundles.find((bundle) => bundle.name === '@deepseek-ai/dsh-base')
    return {
      names: bundles.filter((bundle) => bundle.enabled && bundle.installed && !bundle.official).map((bundle) => bundle.name),
      baseVersion: base?.version,
    }
  }

  /** The feed answer is shared by the status probe and the plan; one network read per few minutes is enough. */
  let feed = { at: 0, value: undefined }
  const target = async () => {
    if (feed.value !== undefined && Date.now() - feed.at < 5 * 60 * 1000) return feed.value
    const value = await fetchTarget(feedUrl)
    feed = { at: Date.now(), value }
    return value
  }

  const runningVersion = async () => {
    const [{ baseVersion }, detected] = await Promise.all([profileState(), detectRuntimeVersion()])
    return detected.version === undefined && typeof baseVersion === 'string'
      ? { version: baseVersion, source: 'profile bundles' }
      : detected
  }

  const buildPlan = async () => {
    const directory = profileDir()
    if (typeof directory !== 'string' || directory === '') throw new Error('profile directory is unknown')
    const [{ names }, next, current] = await Promise.all([profileState(), target(), runningVersion()])
    if (compareVersions(next.version, current.version) <= 0) {
      return { current, target: next, checkedAt: new Date().toISOString(), upToDate: true, plugins: [], incompatible: [] }
    }
    const plugins = await evaluateProfile(directory, names, next.version)
    return {
      current,
      target: next,
      checkedAt: new Date().toISOString(),
      upToDate: false,
      plugins,
      incompatible: plugins.filter((plugin) => plugin.installed && !plugin.compatible).map((plugin) => plugin.name),
    }
  }

  /** Whether an update is waiting; the button renders only when it is. */
  const buildStatus = async () => {
    const [next, current] = await Promise.all([target(), runningVersion()])
    const order = compareVersions(next.version, current.version)
    return { available: order === undefined ? true : order > 0, current, target: next }
  }

  const disable = async (names) => {
    const disabled = []
    const failed = []
    for (const pending of names) {
      try {
        const result = await ctx.pluginManager.setBundleEnabled(pending, false)
        if (result.application === 'failed' || result.application === 'cancelled' || result.error !== undefined) {
          failed.push({ name: pending, error: result.error?.code ?? result.application })
          continue
        }
        disabled.push({ name: pending, application: result.application, restartReason: result.restartReason })
      } catch (error) {
        failed.push({ name: pending, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return { disabled, failed }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${API}/status`,
    handler: async (request, response) => {
      if (request.method !== 'GET') return send(response, 405, { error: 'GET only' })
      try {
        send(response, 200, await buildStatus())
      } catch (error) {
        send(response, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${API}/plan`,
    handler: async (request, response) => {
      if (request.method !== 'GET') return send(response, 405, { error: 'GET only' })
      try {
        send(response, 200, await buildPlan())
      } catch (error) {
        send(response, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${API}/disable`,
    handler: async (request, response) => {
      if (request.method !== 'POST') return send(response, 405, { error: 'POST only' })
      try {
        const body = await readBody(request)
        const names = Array.isArray(body.names) ? body.names.filter((entry) => typeof entry === 'string') : []
        if (names.length === 0) return send(response, 400, { error: 'names must be a non-empty array' })
        send(response, 200, await disable(names))
      } catch (error) {
        send(response, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }))
}
