/**
 * Publish a workspace package; on EOTP, open the npm web auth URL in the default browser
 * and poll until a token is available, then retry once.
 *
 * Usage: node ./scripts/publish-with-webauth.mjs @docengine/engine
 */
import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const pkg = process.argv[2]
if (!pkg) {
  console.error('Usage: node ./scripts/publish-with-webauth.mjs <@scope/name>')
  process.exit(1)
}

function runPublish() {
  return new Promise((resolve) => {
    const child = spawn(
      'npm',
      ['publish', '-w', pkg, '--access', 'public'],
      { cwd: process.cwd(), shell: true, env: process.env },
    )
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      process.stdout.write(d)
    })
    child.stderr.on('data', (d) => {
      out += d
      process.stderr.write(d)
    })
    child.on('exit', (code) => resolve({ code: code ?? 1, out }))
  })
}

function extractAuthUrl(out) {
  const m = out.match(/https:\/\/www\.npmjs\.com\/auth\/cli\/\S+/)
  return m?.[0] ?? null
}

function extractDoneUrl(out) {
  const m = out.match(/https:\/\/registry\.npmjs\.org\/-\/v1\/done\?authId=\S+/)
  return m?.[0] ?? null
}

async function waitForDone(doneUrl, timeoutMs = 5 * 60 * 1000) {
  const start = Date.now()
  console.log('\nWaiting for you to approve npm web auth in the browser…')
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(doneUrl)
      if (res.status === 200) {
        return await res.json().catch(() => ({}))
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Timed out waiting for npm web auth')
}

function applyToken(token) {
  if (!token || typeof token !== 'string') return false
  const npmrc = join(homedir(), '.npmrc')
  let text = existsSync(npmrc) ? readFileSync(npmrc, 'utf8') : ''
  const line = `//registry.npmjs.org/:_authToken=${token}`
  if (/\/\/registry\.npmjs\.org\/:_authToken=.*/.test(text)) {
    text = text.replace(/\/\/registry\.npmjs\.org\/:_authToken=.*/g, line)
  } else {
    text = `${text.trimEnd()}\n${line}\n`
  }
  writeFileSync(npmrc, text)
  console.log('Updated ~/.npmrc auth token from web login.')
  return true
}

const first = await runPublish()
if (first.code === 0) {
  console.log(`\nPublished ${pkg}`)
  process.exit(0)
}

const authUrl = extractAuthUrl(first.out)
const doneUrl = extractDoneUrl(first.out)
if (!authUrl) {
  console.error(`\nPublish failed for ${pkg} (no web-auth URL).`)
  process.exit(first.code)
}

try {
  execFileSync('cmd', ['/c', 'start', '', authUrl], { stdio: 'ignore' })
  console.log('\nOpened npm auth page in your default browser.')
} catch {
  // Avoid printing the full auth URL into agent logs when possible.
  appendFileSync(join(process.cwd(), '.npm-auth-url.txt'), `${authUrl}\n`)
  console.error('\nCould not open browser. Auth URL written to .npm-auth-url.txt — open it, then wait.')
}

if (!doneUrl) {
  console.log('Approve the browser prompt, then re-run this script.')
  process.exit(1)
}

try {
  const body = await waitForDone(doneUrl)
  if (body?.token) applyToken(body.token)
  console.log('Web auth completed — retrying publish…')
} catch (err) {
  console.error(String(err))
  process.exit(1)
}

const second = await runPublish()
if (second.code === 0) console.log(`\nPublished ${pkg}`)
process.exit(second.code)
