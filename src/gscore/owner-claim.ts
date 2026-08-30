export type OwnerClaim = {
  userId: string
  userName: string
  createdAt: number
}

const CLAIM_TTL = 10 * 60_000
const CLAIM_WINDOW_TTL = 5 * 60_000
const MAX_CLAIMS = 20
const claims = new Map<string, OwnerClaim>()
let activeUntil = 0

function prune(): void {
  const threshold = Date.now() - CLAIM_TTL
  for (const [userId, claim] of claims) {
    if (claim.createdAt < threshold) claims.delete(userId)
  }
}

export function startOwnerClaimWindow(): number {
  claims.clear()
  activeUntil = Date.now() + CLAIM_WINDOW_TTL
  return activeUntil
}

export function recordOwnerClaim(userId: string, userName: string): OwnerClaim | null {
  prune()
  if (Date.now() >= activeUntil) return null
  const claim = { userId, userName, createdAt: Date.now() }
  claims.set(userId, claim)
  if (claims.size > MAX_CLAIMS) {
    const oldest = [...claims.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
    if (oldest) claims.delete(oldest.userId)
  }
  return claim
}

export function getOwnerClaimState(): { claims: OwnerClaim[]; activeUntil: number | null } {
  prune()
  return {
    claims: [...claims.values()].sort((a, b) => b.createdAt - a.createdAt),
    activeUntil: Date.now() < activeUntil ? activeUntil : null
  }
}
