import type { Region } from '@/lib/region'

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
 * One store per region, each with its OWN Associates account and tracking ID.
 *
 * This is the part that is easy to get wrong: a tag only earns in the store it
 * belongs to. Sending a US visitor to amazon.ca, or putting the .ca tag on an
 * amazon.com link, pays nothing — the link still works, it just silently earns
 * zero, which is why the shelf picks the store from the visitor's country
 * rather than relying on Amazon's own redirect.
 *
 * Tags are public by design — they travel in the URL — so they belong in
 * source, not in env.
 *
 * Each account carries its own 180-day probation: three qualifying sales in
 * that store or Amazon closes THAT account. Two stores means two clocks.
 */
const STORES: Record<Region, { host: string; tag: string }> = {
  CA: { host: 'https://www.amazon.ca', tag: 'learnhoops-20' },
  US: { host: 'https://www.amazon.com', tag: 'learnhoops05-20' },
}

/** One store's listing for a piece of gear. */
export type Listing = {
  /** Amazon's product ID — the only durable part of an Amazon URL. */
  asin: string
  /** Product name. An item with an empty name is treated as unfinished and is
   *  not rendered, so a half-filled list never ships a broken card. */
  name: string
  /** Why a LearnHoops player would want it. Honest, first-person, no hype. */
  blurb: string
  /**
   * Optional photos, as paths under /public. NEVER an Amazon product image —
   * those are the seller's and are not licensed to us (see the header above).
   * Only our own photography, or a picture we have written permission to use.
   *
   * Per LISTING rather than per slot, because the two stores stock different
   * products on four of the six slots, and a photo of the CA item on a US card
   * would be a misleading ad.
   *
   * Every file must be SQUARE. The shelf fills its tile edge to edge, so a
   * non-square image would either get cropped or leave a band of tile colour
   * showing — and these do not share a background (one is on white, one on
   * grey, one is a full-bleed photo of sky), so such a band would read as a
   * seam on some cards and not others. Pad to square against the image's OWN
   * background when exporting, never at render time.
   *
   * `alt` is part of the pair rather than a sibling field so an image cannot
   * be added without describing it.
   */
  images?: { src: string; alt: string }[]
}

/**
 * A slot on the shelf, with the listing that fills it in each store.
 *
 * Name and blurb are per-region because the stores do not carry the same
 * products: the pumps are different brands, and the CA "net" is a replacement
 * rim with the net already on it while the US one is a net that straps onto a
 * rimless hoop. Only `kind` is shared, because the ROLE the item plays in a
 * player's kit is the same on both sides of the border — and that role is what
 * the ordering below is built on.
 */
export type GearItem = {
  /** Short category label shown above the name. */
  kind: string
  CA: Listing
  US: Listing
}

/**
 * Ordered by how directly each slot touches something we actually grade, since
 * the shelf scrolls and the first two cards are the only ones most people see.
 * The bag is last: it is the one item that changes nothing about a shot.
 *
 * Names are deliberately shorter than the Amazon listing titles, which are
 * keyword-stuffed to the point of being unreadable. The ASIN identifies the
 * product; the name is ours to write.
 */
export const GEAR: GearItem[] = [
  {
    kind: 'Shooting Aid',
    CA: {
      asin: 'B0BHL3P9R3',
      name: 'Off-Hand Shooting Trainer',
      // Used with the rights-holder's permission (owner's call, 2026-08-26).
      // NOTE: this photo shows a strap-on guide-hand board, while both the CA
      // and US listings here are a black disc. Shown at the owner's explicit
      // direction as an illustration of the technique, not of the exact item.
      // If either listing is ever swapped for the board in the picture, this
      // comment can go.
      images: [
        {
          src: '/gear/off-hand-trainer.webp',
          alt: 'A young player shooting, seen from behind, with a training board strapped to the guide hand so it cannot push the ball.',
        },
      ],
      blurb:
        'A padded disc your guide-hand fingers slip into, so that hand can steer the ball but never push it. Two of the eighteen things we grade are Guide Hand Placement and Guide Hand Follow Through, and a guide-hand push is the hardest fault to feel while you are making it. Comes with goggles that hide the ball from your eyes for dribbling work.',
    },
    US: {
      asin: 'B0FFH3XCJZ',
      name: 'Off-Hand Shooting Trainer',
      // Same photo and the same caveat as the CA listing above.
      images: [
        {
          src: '/gear/off-hand-trainer.webp',
          alt: 'A young player shooting, seen from behind, with a training board strapped to the guide hand so it cannot push the ball.',
        },
      ],
      blurb:
        'A hand-placement corrector that stops the guide hand interfering with the ball, so it can steer but never push. Two of the eighteen things we grade are Guide Hand Placement and Guide Hand Follow Through, and a guide-hand push is the hardest fault to feel while you are making it. Ships with a 5.3" shooting aid as well.',
    },
  },
  {
    kind: 'Solo Reps',
    CA: {
      asin: 'B08VYKKHWV',
      name: 'Spalding Back Atcha Ball Return',
      blurb:
        'A chute that clips onto the rim and kicks makes back out to you instead of leaving you to chase them. If you film your own sessions, this is the single biggest change to how many usable reps you get in twenty minutes.',
    },
    US: {
      asin: 'B08VYSFGVB',
      name: 'Spalding Back Atcha Ball Return',
      blurb:
        'A chute that clips onto the rim and kicks makes back out to you instead of leaving you to chase them. If you film your own sessions, this is the single biggest change to how many usable reps you get in twenty minutes.',
    },
  },
  {
    kind: 'Pressure',
    CA: {
      asin: 'B0F8C35H99',
      name: 'Hand-in-Face Contest Mask',
      blurb:
        'A head strap that holds a padded hand out in front of your face, so every rep is contested instead of wide open. Form that only survives an empty gym is not finished yet, and this is the cheapest way to find out which parts of yours hold up.',
    },
    US: {
      asin: 'B0F8C35H99',
      name: 'Hand-in-Face Contest Mask',
      blurb:
        'A head strap that holds a padded hand out in front of your face, so every rep is contested instead of wide open. Form that only survives an empty gym is not finished yet, and this is the cheapest way to find out which parts of yours hold up.',
    },
  },
  {
    kind: 'Maintenance',
    CA: {
      asin: 'B0F7RLMMJF',
      name: 'Olgeo Electric Ball Pump',
      blurb:
        'A flat ball changes how it comes off your hand, and a hand pump never gets you to the right pressure twice in a row. This one runs off a battery, hits a set PSI and stops. Works on volleyballs and soccer balls too.',
    },
    US: {
      asin: 'B0869379NP',
      name: 'Electric Ball Pump',
      blurb:
        'A flat ball changes how it comes off your hand, and a hand pump never gets you to the right pressure twice in a row. This one runs off a battery, reads out on an LCD, hits a set pressure and stops. Works on volleyballs and soccer balls too.',
    },
  },
  {
    kind: 'Court Repair',
    CA: {
      asin: 'B0D8RF772B',
      name: 'Replacement Rim & Net',
      // Used with the rights-holder's permission (owner's call, 2026-08-26).
      // The mounted shot is cropped from a seller banner: the original had
      // marketing type across the top half, including "Soild" for "Solid", so
      // only the photograph below it is kept.
      // CA only — the US slot is a throw-and-attach net, a different product.
      images: [
        {
          src: '/gear/rim-net-product.webp',
          alt: 'A black basketball rim with a red, white and blue net already laced onto it.',
        },
        {
          src: '/gear/rim-net-mounted.webp',
          alt: 'The same rim and net fitted to a glass backboard outdoors, seen from below against a blue sky.',
        },
      ],
      blurb:
        'A rim with the net already laced onto it, for the driveway hoop whose net rotted off two winters ago. Worth fixing before you film anything: on a bare rim, a clean make and a rattle-out look identical on video.',
    },
    US: {
      asin: 'B0CX952N3X',
      name: 'Throw-and-Attach Net',
      blurb:
        'A net for a hoop that has lost one, and it goes on without a ladder or a single hook — you throw it over the rim and it holds. Worth fixing before you film anything: on a bare rim, a clean make and a rattle-out look identical on video.',
    },
  },
  {
    kind: 'Carry',
    CA: {
      asin: 'B079ZBFBTM',
      name: 'Nike Hoops Elite Backpack',
      blurb:
        'The one thing on this shelf that will not change your shot: it is a bag. What it does is keep a pair of sweaty basketball shoes in their own ventilated compartment, away from your clothes and your phone. Big main compartment, insulated pocket for a bottle, and it is the best-selling basketball bag on Amazon for a reason.',
    },
    US: {
      asin: 'B079ZBFBTM',
      name: 'Nike Hoops Elite Backpack',
      blurb:
        'The one thing on this shelf that will not change your shot: it is a bag. What it does is keep a pair of sweaty basketball shoes in their own ventilated compartment, away from your clothes and your phone. Big main compartment, insulated pocket for a bottle, and it is the best-selling basketball bag on Amazon for a reason.',
    },
  },
]

/** A card, resolved for one store. */
export type ResolvedGear = Listing & { kind: string }

/** The cards to actually show a visitor in `region`, skipping any slot whose
 *  listing for that store is unfinished. */
export function readyGear(region: Region): ResolvedGear[] {
  return GEAR.map((item) => ({ kind: item.kind, ...item[region] })).filter(
    (g) => g.asin && g.name && g.blurb,
  )
}

/** Builds the outbound link for one store. Everything after the ASIN in an
 *  Amazon URL is their own session tracking and is stripped — only the tag is
 *  ours, and it must be the tag belonging to that store. */
export function amazonUrl(asin: string, region: Region): string {
  const { host, tag } = STORES[region]
  const base = host + '/dp/' + asin
  return tag ? base + '?tag=' + tag : base
}
