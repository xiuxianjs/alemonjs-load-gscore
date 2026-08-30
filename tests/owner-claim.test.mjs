import assert from 'node:assert/strict'
import test from 'node:test'
import { getOwnerClaimState, recordOwnerClaim, startOwnerClaimWindow } from '../lib/gscore/owner-claim.js'

test('records owner ids only during an explicitly opened claim window', () => {
  assert.equal(recordOwnerClaim('user-before', 'Before'), null)

  const activeUntil = startOwnerClaimWindow()
  assert.ok(activeUntil > Date.now())
  assert.deepEqual(recordOwnerClaim('user-1', 'Alice'), {
    userId: 'user-1', userName: 'Alice', createdAt: getOwnerClaimState().claims[0].createdAt
  })
  assert.deepEqual(getOwnerClaimState().claims.map(claim => claim.userId), ['user-1'])
})
