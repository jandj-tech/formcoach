/**
 * "Gear we like" — Amazon affiliate recommendations.
 *
 * These are NOT LearnHoops products. We do not stock, ship, or support them;
 * every card links straight out to Amazon and Amazon handles the sale. We earn
 * a small commission when someone buys through the link, which is why the
 * disclosure in GearWeLike.tsx is mandatory, not optional.
 *
 * Amazon Associates operating agreement, the parts that constrain this file:
 *  - No prices. A hardcoded price goes stale and displaying a stale one is a
 *    breach. Cards say "check price on Amazon" instead.
 *  - No Amazon product images. Scraped or hotlinked product photos are not
 *    licensed. Use our own photography in /public or no image at all.
 *  - No affiliate links in email or PDF. Keep these off lib/email.ts and the
 *    printed report.
 */

/**
 * The Associates tracking ID, appended to every outbound link. It is public by
 * design — it travels in the URL — so it belongs in source, not in env.
 */
export const AMAZON_TAG = 'learnhoops-20'

/** Amazon Canada. OneLink (set up in the Associates dashboard) redirects US
 *  visitors to the .com equivalent and still credits us, so one host is fine. */
const AMAZON_HOST = 'https://www.amazon.ca'

export type GearItem = {
  /** Amazon's product ID — the only durable part of an Amazon URL. */
  asin: string
  /** Product name. An item with an empty name is treated as unfinished and
   *  is not rendered, so a half-filled list never ships a broken card. */
  name: string
  /** Short category label shown above the name. */
  kind: string
  /** Why a LearnHoops player would want it. Honest, first-person, no hype. */
  blurb: string
}

/**
 * Ordered by how directly each item touches something we actually grade, since
 * the shelf scrolls and the first two cards are the only ones most people see.
 *
 * Names are deliberately shorter than the Amazon listing titles, which are
 * keyword-stuffed to the point of being unreadable. The ASIN identifies the
 * product; the name is ours to write.
 */
export const GEAR: GearItem[] = [
  {
    asin: 'B0BHL3P9R3',
    name: 'Off-Hand Shooting Trainer',
    kind: 'Shooting Aid',
    blurb:
      'A padded disc your guide-hand fingers slip into, so that hand can steer the ball but never push it. Two of the eighteen things we grade are Guide Hand Placement and Guide Hand Follow Through, and a guide-hand push is the hardest fault to feel while you are making it. Comes with goggles that hide the ball from your eyes for dribbling work.',
  },
  {
    asin: 'B08VYKKHWV',
    name: 'Spalding Back Atcha Ball Return',
    kind: 'Solo Reps',
    blurb:
      'A chute that clips onto the rim and kicks makes back out to you instead of leaving you to chase them. If you film your own sessions, this is the single biggest change to how many usable reps you get in twenty minutes.',
  },
  {
    asin: 'B0F8C35H99',
    name: 'Hand-in-Face Contest Mask',
    kind: 'Pressure',
    blurb:
      'A head strap that holds a padded hand out in front of your face, so every rep is contested instead of wide open. Form that only survives an empty gym is not finished yet, and this is the cheapest way to find out which parts of yours hold up.',
  },
  {
    asin: 'B0F7RLMMJF',
    name: 'Olgeo Electric Ball Pump',
    kind: 'Maintenance',
    blurb:
      'A flat ball changes how it comes off your hand, and a hand pump never gets you to the right pressure twice in a row. This one runs off a battery, hits a set PSI and stops. Works on volleyballs and soccer balls too.',
  },
  {
    asin: 'B0D8RF772B',
    name: 'Replacement Rim & Net',
    kind: 'Court Repair',
    blurb:
      'A rim with the net already laced onto it, for the driveway hoop whose net rotted off two winters ago. Worth fixing before you film anything: on a bare rim, a clean make and a rattle-out look identical on video.',
  },
]

/** Items that are actually ready to show. */
export const READY_GEAR = GEAR.filter((item) => item.name && item.kind && item.blurb)

/** Builds the outbound link. Everything after the ASIN in an Amazon URL is
 *  their own session tracking and is stripped — only the tag is ours. */
export function amazonUrl(asin: string): string {
  const base = AMAZON_HOST + '/dp/' + asin
  return AMAZON_TAG ? base + '?tag=' + AMAZON_TAG : base
}
