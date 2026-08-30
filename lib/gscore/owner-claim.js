//#region src/gscore/owner-claim.ts
const CLAIM_TTL = 6e5;
const CLAIM_WINDOW_TTL = 3e5;
const MAX_CLAIMS = 20;
const claims = /* @__PURE__ */ new Map();
let activeUntil = 0;
function prune() {
	const threshold = Date.now() - CLAIM_TTL;
	for (const [userId, claim] of claims) if (claim.createdAt < threshold) claims.delete(userId);
}
function startOwnerClaimWindow() {
	claims.clear();
	activeUntil = Date.now() + CLAIM_WINDOW_TTL;
	return activeUntil;
}
function recordOwnerClaim(userId, userName) {
	prune();
	if (Date.now() >= activeUntil) return null;
	const claim = {
		userId,
		userName,
		createdAt: Date.now()
	};
	claims.set(userId, claim);
	if (claims.size > MAX_CLAIMS) {
		const oldest = [...claims.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
		if (oldest) claims.delete(oldest.userId);
	}
	return claim;
}
function getOwnerClaimState() {
	prune();
	return {
		claims: [...claims.values()].sort((a, b) => b.createdAt - a.createdAt),
		activeUntil: Date.now() < activeUntil ? activeUntil : null
	};
}

//#endregion
export { getOwnerClaimState, recordOwnerClaim, startOwnerClaimWindow };