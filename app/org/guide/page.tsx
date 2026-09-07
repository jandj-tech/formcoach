import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import PrintButton from '@/components/PrintButton'
import {
  GUIDE_SECTIONS,
  WeeklyChecklist,
  GettingStarted,
  TeamsCoaches,
  AddingPlayers,
  Uploading,
  ViewingScores,
  SendingResults,
  WhatPlayersSee,
  LockingResults,
  Selling,
  Payments,
  CoachLedProgram,
  EditingEvaluation,
  OrgSettings,
  Troubleshooting,
} from './sections'

export const metadata: Metadata = {
  title: 'Organization Guide — LearnHoops',
  description:
    'Step-by-step manual for basketball clubs and coaches: set up your organization, add teams and players, upload shots, email results every week, choose what families see for free, and sell the full breakdown, a LearnHoops ball or your Shooting Class from the results page.',
  alternates: { canonical: '/org/guide' },
}

// Public, printable manual for club administrators and coaches. No auth: a
// coach should be able to read this before their club has even signed up, and
// an admin should be able to hand the printed copy to a volunteer.
export default function OrgGuidePage() {
  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .guide-section { break-inside: avoid; }
          .print-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          a { color: inherit; text-decoration: none; }
        }
      `}</style>

      <main className="min-h-screen bg-white text-black flex flex-col">
        <div className="no-print">
          <TopNav />
        </div>

        <div className="flex-1 w-full max-w-3xl mx-auto px-6 py-10 sm:py-14">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="mb-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-orange-600 mb-2">LearnHoops.com</p>
                <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight leading-[0.95] text-black">
                  Organization Guide
                </h1>
              </div>
              <div className="no-print pt-1">
                <PrintButton label="Print this guide" />
              </div>
            </div>
            <p className="text-gray-700 leading-relaxed mt-4 max-w-2xl">
              Everything a club administrator or coach needs to run LearnHoops: set up your organization, get players on
              rosters, upload one shot per player, and email every family their score each week. If you choose to sell the full
              breakdown, a LearnHoops ball or your own Shooting Class, this guide shows you where every price and switch lives.
            </p>
            <p className="text-gray-500 text-sm mt-3">
              Every step names the exact tab or button in <b className="text-black">bold</b>. Nothing here needs technical knowledge.
            </p>
          </header>

          {/* ── Table of contents ──────────────────────────────────── */}
          <nav aria-label="Table of contents" className="guide-section rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 mb-8">
            <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-3">In this guide</p>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {GUIDE_SECTIONS.map((s, i) => (
                <li key={s.id} className="flex gap-2.5 text-sm">
                  <span className="font-numeric font-black text-orange-500 tabular-nums shrink-0 w-6">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <a href={`#${s.id}`} className="text-gray-800 hover:text-orange-600 font-semibold leading-snug">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* ── One-page weekly checklist ──────────────────────────── */}
          <WeeklyChecklist />

          {/* ── Sections, in the order GUIDE_SECTIONS declares ─────── */}
          <GettingStarted />
          <TeamsCoaches />
          <AddingPlayers />
          <Uploading />
          <ViewingScores />
          <SendingResults />
          <WhatPlayersSee />
          <LockingResults />
          <Selling />
          <Payments />
          <CoachLedProgram />
          <EditingEvaluation />
          <OrgSettings />
          <Troubleshooting />

          <div className="mt-12 pt-6 border-t border-gray-200 text-gray-500 text-xs leading-relaxed">
            Prices shown for the draft offers are starting points you must review; you set every price your families see.
            Plan prices and the organization token rate are current as of this guide. Questions: <b>support@learnhoops.com</b>.
          </div>
        </div>

        <div className="no-print">
          <SiteFooter />
        </div>
      </main>
    </>
  )
}
