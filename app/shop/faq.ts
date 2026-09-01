import { FREE_ANALYSES_PER_BALL } from './product'

/**
 * The shop's questions, in one place so the visible accordions and the
 * FAQPage structured data are generated from the same array and cannot drift.
 *
 * Same reasoning as app/support/page.tsx, which does this deliberately: schema
 * that claims a page says something it does not is a structured-data
 * violation, and the way that happens is always two copies of the text.
 *
 * Answers are plain strings, not JSX, precisely so the schema can use them
 * verbatim. Anything needing markup does not belong in an FAQ answer.
 */
export interface ShopFaq {
  q: string
  /** Paragraphs. Joined with a space for the schema's answer text. */
  a: string[]
}

/** Shown inside the buy box, under the ball. */
export const BALL_FAQ: ShopFaq[] = [
  {
    q: "What's included with the training ball?",
    a: [
      `One training ball in your chosen size and edition, plus ${FREE_ANALYSES_PER_BALL} free AI shot ` +
        `analyses added to your account after purchase. The printed grip lines mark exactly where ` +
        `your fingers belong.`,
    ],
  },
  {
    q: 'What size basketball should I get?',
    a: [
      'Size 5 (27.5") fits youth players, size 6 (28.5") is the women\'s standard, and size 7 ' +
        '(29.5") is the men\'s standard. When in doubt, pick the size used in your league.',
    ],
  },
  {
    q: 'How much is shipping and how fast is it?',
    a: [
      'Enter your state or postal code in the cart to see your shipping cost before you pay — ' +
        "orders ship Canada Post within Canada and USPS within the US. You'll get a receipt by " +
        'email right away and another email when your order ships.',
    ],
  },
]

/** Shown in the shot-analysis section further down the page. */
export const ANALYSIS_FAQ: ShopFaq[] = [
  {
    q: 'What do I get with a shot analysis?',
    a: [
      'A full private breakdown: your overall score, a score and coaching tip for each of the 18 ' +
        'criteria, and the frames the AI studied. Your results link is emailed to you and stays ' +
        'private — bookmark it, it always works.',
    ],
  },
  {
    q: 'How does the shot analysis work?',
    a: [
      'Film your shot from the front, standing near the basket so the elbow, hands and feet are ' +
        'visible, upload the clip on the Analyze page, and your results arrive by email within ' +
        'minutes. Any phone camera works — MP4 or MOV.',
    ],
  },
  {
    q: 'Can I get shot analyses for free?',
    a: [
      `Yes — the training ball includes ${FREE_ANALYSES_PER_BALL} free analyses and the 2-ball ` +
        `bundle includes ${FREE_ANALYSES_PER_BALL * 2}. Players on team or organization rosters ` +
        `can also receive analysis tokens from their coach.`,
    ],
  },
]

/** Everything on the page, for the FAQPage node. */
export const SHOP_FAQ: ShopFaq[] = [...BALL_FAQ, ...ANALYSIS_FAQ]
