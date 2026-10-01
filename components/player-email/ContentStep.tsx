'use client'

import { useId, useRef, type ReactNode } from 'react'
import {
  CheckIcon,
  EyeIcon,
  FileTextIcon,
  GraduationCapIcon,
  LoaderCircleIcon,
  PenLineIcon,
  ShoppingBagIcon,
  TrophyIcon,
  UserPlusIcon,
} from 'lucide-react'
import {
  PLAYER_EMAIL_LIMITS,
  PLAYER_EMAIL_TEMPLATES,
  type PlayerEmailContent,
  type PlayerEmailTemplateId,
} from '@/lib/player-email-templates'
import StepCard from './StepCard'
import {
  CHECKBOX,
  INPUT,
  getsSetupEmail,
  previewScoreLabel,
  type PlannedEmail,
  type PreviewResponse,
  type Recipient,
  type SenderAs,
} from './types'

// Step 2 — what it says. A template is only a starting point: it fills the
// subject, message and "Include" boxes, and everything stays editable. The
// preview on the right is rendered by the server for one real recipient, so
// what the sender sees is what that player receives.

const TEMPLATE_ICONS: Record<PlayerEmailTemplateId, typeof TrophyIcon> = {
  results: TrophyIcon,
  program: GraduationCapIcon,
  gear: ShoppingBagIcon,
  message: PenLineIcon,
}

const FIRST_NAME = '{{first_name}}'

export default function ContentStep({
  as,
  content,
  offers,
  undoLabel,
  disabled,
  previewCandidates,
  previewId,
  preview,
  previewLoading,
  previewError,
  previewBlocked,
  sender,
  onContent,
  onTemplate,
  onUndo,
  onPreviewId,
  onGoToOffers,
  resultsExtra,
}: {
  as: SenderAs
  content: PlayerEmailContent
  offers: { count: number; titles: string[] }
  undoLabel: string | null
  disabled: boolean
  /** Before players are picked: anyone reachable; after: the plan's emails. */
  previewCandidates: Array<Recipient | PlannedEmail>
  previewId: string | null
  preview: PreviewResponse | null
  previewLoading: boolean
  previewError: string | null
  previewBlocked: string | null
  sender: { displayName: string; replyTo: string; fromHeader: string }
  onContent: (patch: Partial<PlayerEmailContent>) => void
  onTemplate: (id: PlayerEmailTemplateId) => void
  onUndo: () => void
  onPreviewId: (id: string) => void
  onGoToOffers?: () => void
  /** Shown under the results box while it is ticked (the "Which shots?" choice). */
  resultsExtra?: ReactNode
}) {
  const subjectId = useId()
  const messageId = useId()
  const previewSelectId = useId()
  const subjectRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const lastField = useRef<'subject' | 'message'>('message')

  const hasOffers = offers.count > 0

  function insertFirstName() {
    const field = lastField.current
    const el = field === 'subject' ? subjectRef.current : messageRef.current
    const value = field === 'subject' ? content.subject : content.message
    const max = field === 'subject' ? PLAYER_EMAIL_LIMITS.subject : PLAYER_EMAIL_LIMITS.message
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = (value.slice(0, start) + FIRST_NAME + value.slice(end)).slice(0, max)
    onContent(field === 'subject' ? { subject: next } : { message: next })
    const caret = start + FIRST_NAME.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const includeRow = (
    key: 'includeResults' | 'includeOffers' | 'includeShopLink',
    label: string,
    hint: string,
    opts: { disabled?: boolean; extra?: ReactNode } = {},
  ) => {
    const id = `${messageId}-${key}`
    const off = disabled || opts.disabled
    return (
      <li>
        <label htmlFor={id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${off ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800/60'}`}>
          <input
            id={id}
            type="checkbox"
            className={`${CHECKBOX} mt-0.5`}
            checked={!opts.disabled && content[key]}
            disabled={off}
            onChange={(e) => onContent({ [key]: e.target.checked })}
            aria-describedby={`${id}-hint`}
          />
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${opts.disabled ? 'text-gray-400 dark:text-chalk-dim' : 'text-gray-900 dark:text-chalk'}`}>{label}</span>
            <span id={`${id}-hint`} className="block text-xs text-gray-500 dark:text-chalk-dim">
              {hint}
            </span>
          </span>
        </label>
        {opts.extra}
      </li>
    )
  }

  return (
    <StepCard step={2} title="What it says" description="Start from a template, then change anything you like.">
      <div className="space-y-5">
        {/* Templates */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-chalk-dim mb-2">Start from</legend>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
            {PLAYER_EMAIL_TEMPLATES.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id]
              const active = content.template === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onTemplate(t.id)}
                  className={`relative text-left rounded-xl border px-3.5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 ${
                    active
                      ? 'border-ember-500 bg-ember-500/5 dark:bg-ember-500/10'
                      : 'border-gray-200 dark:border-courtline hover:border-gray-300 dark:hover:border-chalk-dim/40'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${active ? 'text-ember-600 dark:text-ember-400' : 'text-gray-500 dark:text-chalk-dim'}`} aria-hidden />
                    <span className="text-sm font-semibold text-gray-900 dark:text-chalk">{t.label}</span>
                    {active && <CheckIcon className="ml-auto w-4 h-4 text-ember-600 dark:text-ember-400" aria-hidden />}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-chalk-dim">{t.hint}</span>
                </button>
              )
            })}
          </div>
          {undoLabel && (
            <p role="status" className="mt-2 text-xs text-gray-600 dark:text-chalk-dim">
              Your text was replaced with the {undoLabel} template.{' '}
              <button type="button" onClick={onUndo} className="font-semibold text-ember-600 dark:text-ember-400 underline underline-offset-2">
                Undo
              </button>
            </p>
          )}
        </fieldset>

        <div className="grid gap-5 lg:grid-cols-2 min-w-0">
          {/* Editor */}
          <div className="space-y-4 min-w-0">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={subjectId} className="text-sm font-semibold text-gray-900 dark:text-chalk">
                  Subject
                </label>
                <span className="text-[11px] tabular-nums text-gray-400 dark:text-chalk-dim">
                  {content.subject.length}/{PLAYER_EMAIL_LIMITS.subject}
                </span>
              </div>
              <input
                id={subjectId}
                ref={subjectRef}
                type="text"
                value={content.subject}
                maxLength={PLAYER_EMAIL_LIMITS.subject}
                disabled={disabled}
                onFocus={() => (lastField.current = 'subject')}
                onChange={(e) => onContent({ subject: e.target.value.replace(/[\r\n]+/g, ' ') })}
                placeholder="For example: No practice tonight"
                className={`${INPUT} mt-1.5`}
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={messageId} className="text-sm font-semibold text-gray-900 dark:text-chalk">
                  Message
                </label>
                <span className="text-[11px] tabular-nums text-gray-400 dark:text-chalk-dim">
                  {content.message.length}/{PLAYER_EMAIL_LIMITS.message}
                </span>
              </div>
              <textarea
                id={messageId}
                ref={messageRef}
                value={content.message}
                maxLength={PLAYER_EMAIL_LIMITS.message}
                disabled={disabled}
                rows={9}
                onFocus={() => (lastField.current = 'message')}
                onChange={(e) => onContent({ message: e.target.value })}
                placeholder="Type what you want your players to read. Leave a blank line to start a new paragraph."
                className={`${INPUT} mt-1.5 resize-y leading-relaxed`}
                aria-describedby={`${messageId}-help`}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={insertFirstName}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-courtline px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-chalk hover:border-gray-300 dark:hover:border-chalk-dim/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400"
                >
                  <UserPlusIcon className="w-3.5 h-3.5" aria-hidden />
                  Insert player&apos;s first name
                </button>
                <p id={`${messageId}-help`} className="text-xs text-gray-500 dark:text-chalk-dim">
                  {FIRST_NAME} becomes each player&apos;s real first name in their email.
                </p>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-gray-900 dark:text-chalk">Include</legend>
              <ul className="mt-1 -mx-3">
                {includeRow(
                  'includeResults',
                  "Each player's latest score and results link",
                  'Players without a graded shot yet get your message only.',
                  { extra: content.includeResults ? resultsExtra : null },
                )}
                {includeRow(
                  'includeOffers',
                  hasOffers ? `Our offers (${offers.count})` : 'Our offers',
                  hasOffers
                    ? offers.titles.slice(0, 3).join(', ') + (offers.titles.length > 3 ? ` and ${offers.titles.length - 3} more` : '')
                    : as === 'org'
                      ? 'You have nothing for sale yet. Add a program, class or ball in Offers & Sales first.'
                      : 'There are no offers to include for this team right now.',
                  {
                    disabled: !hasOffers,
                    extra:
                      !hasOffers && as === 'org' && onGoToOffers ? (
                        <button
                          type="button"
                          onClick={onGoToOffers}
                          className="mx-3 mb-1 text-xs font-semibold text-ember-600 dark:text-ember-400 hover:underline"
                        >
                          Go to Offers &amp; Sales
                        </button>
                      ) : null,
                  },
                )}
                {includeRow('includeShopLink', 'Link to the LearnHoops basketball shop', 'A button to order a LearnHoops training ball.')}
              </ul>
            </fieldset>
          </div>

          {/* Preview */}
          <div id="player-email-preview" className="min-w-0 space-y-2 scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-chalk">
                <EyeIcon className="w-4 h-4 text-gray-500 dark:text-chalk-dim" aria-hidden />
                Preview
                {previewLoading && <LoaderCircleIcon className="w-3.5 h-3.5 animate-spin text-gray-400" aria-label="Updating preview" />}
              </p>
              {previewCandidates.length > 0 && (
                <div className="flex items-center gap-2 min-w-0">
                  <label htmlFor={previewSelectId} className="text-xs text-gray-500 dark:text-chalk-dim whitespace-nowrap">
                    Previewing as
                  </label>
                  <select
                    id={previewSelectId}
                    value={previewId ?? ''}
                    onChange={(e) => onPreviewId(e.target.value)}
                    className="min-w-0 max-w-[12rem] rounded-lg border border-gray-300 dark:border-courtline bg-white dark:bg-ink-950 px-2 py-1 text-xs font-semibold text-gray-900 dark:text-chalk focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-400"
                  >
                    {previewCandidates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.player.name}
                        {previewScoreLabel(r)}
                        {getsSetupEmail(r.player, content.includeResults) ? ' · not set up' : ''}
                        {previewCandidates.some((o) => o.team.id !== r.team.id) ? ` · ${r.team.name}` : ''}
                        {/* Two "Jayden M" on one team: the email tells them apart. */}
                        {r.player.email && previewCandidates.some((o) => o.id !== r.id && o.player.name === r.player.name && o.team.id === r.team.id)
                          ? ` · ${r.player.email}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-courtline overflow-hidden">
              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 px-3.5 py-3 text-xs border-b border-gray-200 dark:border-courtline bg-gray-50 dark:bg-ink-950/60">
                <dt className="text-gray-500 dark:text-chalk-dim">From</dt>
                <dd className="font-medium text-gray-900 dark:text-chalk [overflow-wrap:anywhere]">{preview?.fromHeader ?? sender.fromHeader}</dd>
                <dt className="text-gray-500 dark:text-chalk-dim">Reply-to</dt>
                <dd className="font-medium text-gray-900 dark:text-chalk [overflow-wrap:anywhere]">{preview?.replyTo ?? sender.replyTo}</dd>
                {preview && !previewBlocked && (
                  <>
                    <dt className="text-gray-500 dark:text-chalk-dim">To</dt>
                    <dd className="font-medium text-gray-900 dark:text-chalk [overflow-wrap:anywhere]">{preview.to}</dd>
                    <dt className="text-gray-500 dark:text-chalk-dim">Subject</dt>
                    <dd className="font-semibold text-gray-900 dark:text-chalk break-words">{preview.subject}</dd>
                  </>
                )}
              </dl>
              {preview?.variant === 'setup' && !previewBlocked && !previewError && (
                <p className="flex items-start gap-2 border-b border-gray-200 dark:border-courtline bg-ember-500/10 px-3.5 py-2 text-xs text-gray-800 dark:text-chalk">
                  <UserPlusIcon className="mt-px w-3.5 h-3.5 shrink-0 text-ember-600 dark:text-ember-400" aria-hidden />
                  <span>
                    {previewCandidates.find((r) => r.id === previewId)?.player.name ?? 'This player'} hasn’t set up their account yet, so they get this
                    “finish setting up to see your results” version. Their score shows once they’re in.
                  </span>
                </p>
              )}
              {previewBlocked ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <FileTextIcon className="w-6 h-6 text-gray-300 dark:text-chalk-dim" aria-hidden />
                  <p className="text-sm text-gray-500 dark:text-chalk-dim">{previewBlocked}</p>
                </div>
              ) : previewError ? (
                <div className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-400">{previewError}</div>
              ) : preview ? (
                <iframe
                  title={`Email preview for ${previewCandidates.find((r) => r.id === previewId)?.player.name ?? 'the selected player'}`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="block w-full h-[32rem] lg:h-[40rem] bg-[#F4F4F5]"
                />
              ) : (
                <div className="flex min-h-[12rem] items-center justify-center text-sm text-gray-400 dark:text-chalk-dim">Building the preview…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </StepCard>
  )
}
