// Minimal user-generated-content filter (App Store guideline 1.2): blocks
// obvious profanity/slurs in user-chosen display text (nicknames, player
// names, team names). Deliberately small and conservative — display text is
// short, so substring matching with common leet substitutions is enough.

const BLOCKED = [
  'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'b1tch', 'cunt', 'twat',
  'asshole', 'a55hole', 'dick', 'd1ck', 'cock', 'pussy', 'pu55y', 'whore',
  'slut', 'fag', 'f4g', 'dyke', 'nigger', 'n1gger', 'nigga', 'n1gga',
  'chink', 'spic', 'kike', 'wetback', 'retard', 'r3tard', 'rape', 'nazi',
  'hitler', 'kys', 'porn', 'penis', 'vagina', 'blowjob', 'handjob',
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '')
}

/** True when the text is acceptable as user-visible display text. */
export function isCleanDisplayText(text: string): boolean {
  const normalized = normalize(text)
  return !BLOCKED.some(word => normalized.includes(normalize(word)))
}

/** Standard error message for rejected display text. */
export const BLOCKED_TEXT_ERROR = 'That name contains language we don\'t allow. Please choose something else.'
