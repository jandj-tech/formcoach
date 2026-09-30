// Starting points for the "Email players" composer. Client-safe (no db, no
// env): the composer shows these as editable defaults, and the send route
// uses the same text when a field arrives empty, so the two can't drift.
//
// Tokens are replaced per recipient by the server: {{first_name}} (the
// player's first name, or "there"), {{team}}, {{org}} (the org name, or the
// team name for a team outside any org) and {{coach}} (who is sending).

export type PlayerEmailTemplateId = 'results' | 'program' | 'gear' | 'message'

export interface PlayerEmailContent {
  template: PlayerEmailTemplateId
  subject: string
  /** Plain text; a blank line starts a new paragraph. */
  message: string
  /** Each player's latest graded score + a "See your results" button. */
  includeResults: boolean
  /** The organization's active offers (programs, classes, balls). Org teams only. */
  includeOffers: boolean
  /** A button to the LearnHoops basketball shop. */
  includeShopLink: boolean
}

export interface PlayerEmailTemplate {
  id: PlayerEmailTemplateId
  /** Card title in the composer. */
  label: string
  /** One line under the title. */
  hint: string
  defaults: Omit<PlayerEmailContent, 'template'>
}

export const PLAYER_EMAIL_TEMPLATES: readonly PlayerEmailTemplate[] = [
  {
    id: 'results',
    label: 'Shot results',
    hint: "Each player's latest score and a link to their full report.",
    defaults: {
      subject: '{{first_name}}, your latest shot results from {{team}}',
      message:
        'Hi {{first_name}},\n\n' +
        'Your latest shot has been graded. Your overall score is below, and your full report shows exactly what to work on next.\n\n' +
        'Keep practising, and bring any questions to our next session.\n\n' +
        '{{coach}}',
      includeResults: true,
      includeOffers: false,
      includeShopLink: false,
    },
  },
  {
    id: 'program',
    label: 'Program or class',
    hint: 'Invite players to a training program or class.',
    defaults: {
      subject: 'Join the {{org}} shooting program',
      message:
        'Hi {{first_name}},\n\n' +
        'Our next shooting development program is now open. Players work on one part of their shot at a time, get their form graded at the start and the end, and see exactly how much they improved.\n\n' +
        // Honest with or without offers attached: when "Our offers" is on,
        // the offers block (with its own "See details and sign up" button)
        // follows this message; when it isn't, replying is the way in.
        'Spots are limited. Reply to this email to save a spot or ask any questions.\n\n' +
        '{{coach}}',
      includeResults: false,
      includeOffers: true,
      includeShopLink: false,
    },
  },
  {
    id: 'gear',
    label: 'Basketballs',
    hint: 'Let players know where to get a LearnHoops training ball.',
    defaults: {
      subject: 'Train at home with a LearnHoops basketball',
      message:
        'Hi {{first_name}},\n\n' +
        'The fastest way to improve your shot is to practise between sessions. The LearnHoops training ball has markings that show your hand placement and backspin, so you can check your form on every rep.\n\n' +
        'You can order one below.\n\n' +
        '{{coach}}',
      includeResults: false,
      includeOffers: false,
      includeShopLink: true,
    },
  },
  {
    id: 'message',
    label: 'Blank message',
    hint: 'Write your own, for anything else (a cancelled practice, a reminder).',
    defaults: {
      subject: '',
      message: '',
      includeResults: false,
      includeOffers: false,
      includeShopLink: false,
    },
  },
] as const

export function playerEmailTemplate(id: PlayerEmailTemplateId): PlayerEmailTemplate {
  return PLAYER_EMAIL_TEMPLATES.find((t) => t.id === id) ?? PLAYER_EMAIL_TEMPLATES[0]
}

export const PLAYER_EMAIL_LIMITS = {
  subject: 150,
  message: 5000,
  recipients: 1000,
} as const
