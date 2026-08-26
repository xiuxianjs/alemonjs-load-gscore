import assert from 'node:assert/strict'
import test from 'node:test'
import { isGSCoreAction } from '../lib/gscore/actions.js'

test('accepts only declared GsCore actions', () => {
  assert.equal(isGSCoreAction('status'), true)
  assert.equal(isGSCoreAction('logs'), true)
  assert.equal(isGSCoreAction('save-config'), true)
  assert.equal(isGSCoreAction('remove-plugin'), true)
  assert.equal(isGSCoreAction('delete-all'), false)
  assert.equal(isGSCoreAction(undefined), false)
})
