/**
 * One bcrypt cost factor for every password the app hashes.
 *
 * Was 10, hardcoded at each of the seven call sites. 12 is the current
 * sensible default: ~4x the work per guess for an attacker holding a dumped
 * table, still well under 300ms on the serverless tier.
 *
 * Existing 10-cost hashes keep verifying — bcrypt stores the cost in the hash
 * itself, so `bcrypt.compare` reads it from the stored value. Accounts upgrade
 * naturally as people change or reset their passwords; nothing needs migrating.
 */
export const BCRYPT_COST = 12
