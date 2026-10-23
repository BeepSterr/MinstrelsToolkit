import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadFileSecrets } from '../src/server/secrets'

let dir: string

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'))
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function write(name: string, content: string): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content)
  return p
}

describe('loadFileSecrets', () => {
  test('sets X from X_FILE', () => {
    const env: Record<string, string | undefined> = { X_FILE: write('a', 's3cret\n') }
    loadFileSecrets(env)
    expect(env.X).toBe('s3cret')
  })

  test('strips only one newline', () => {
    const env: Record<string, string | undefined> = { X_FILE: write('b', 'a\n\n') }
    loadFileSecrets(env)
    expect(env.X).toBe('a\n')
  })

  test('strips a trailing CRLF', () => {
    const env: Record<string, string | undefined> = { X_FILE: write('crlf', 'a\r\n') }
    loadFileSecrets(env)
    expect(env.X).toBe('a')
  })

  test('_FILE wins over plain', () => {
    const env: Record<string, string | undefined> = { X: 'old', X_FILE: write('c', 'new') }
    loadFileSecrets(env)
    expect(env.X).toBe('new')
  })

  test('plain env untouched without _FILE', () => {
    const env: Record<string, string | undefined> = { X: 'plain' }
    loadFileSecrets(env)
    expect(env.X).toBe('plain')
  })

  test('empty _FILE value is ignored', () => {
    const env: Record<string, string | undefined> = { X: 'plain', X_FILE: '' }
    loadFileSecrets(env)
    expect(env.X).toBe('plain')
  })

  test('missing file throws', () => {
    const missing = path.join(dir, 'nope')
    const env: Record<string, string | undefined> = { X_FILE: missing }
    expect(() => loadFileSecrets(env)).toThrow(`X_FILE: cannot read secret file ${missing}`)
  })

  test('empty file throws', () => {
    const p = write('empty', '')
    const env: Record<string, string | undefined> = { X_FILE: p }
    expect(() => loadFileSecrets(env)).toThrow(`X_FILE: cannot read secret file ${p}`)
  })

  test('error never contains file content', () => {
    const p = write('dir-ish', 'topsecret')
    const env: Record<string, string | undefined> = { X_FILE: path.join(p, 'x') }
    try {
      loadFileSecrets(env)
    } catch (e) {
      expect(String(e)).not.toContain('topsecret')
    }
  })
})
