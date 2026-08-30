import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getOrgSession } from '@/lib/org-auth'
import { getTeamSession } from '@/lib/team-auth'
import PrintButton from './PrintButton'
import {
  WEEKS,
  HOUR,
  EQUIPMENT,
  FILMING,
  AGE_ADAPTATIONS,
  GAMES_LIBRARY,
  CRITERIA_INDEX,
  COACHING_RULES,
  PROGRAM_OVERVIEW,
  PRO_NOTES,
  type BlockKind,
} from '@/lib/class-curriculum'

interface Props {
  params: Promise<{ packageId: string }>
}

// Block colour tells a coach at a glance whether they're talking, drilling or
// competing — the three things a session is made of.
const BLOCK_STYLE: Record<BlockKind, { label: string; chip: string; rail: string }> = {
  warmup: { label: 'Warm-up', chip: 'bg-gray-200 text-gray-700', rail: 'bg-gray-300' },
  lesson: { label: 'Lesson', chip: 'bg-ink-950 text-white', rail: 'bg-ink-950' },
  drill: { label: 'Drill', chip: 'bg-gray-100 text-gray-600', rail: 'bg-gray-200' },
  game: { label: 'Game', chip: 'bg-ember-500 text-white', rail: 'bg-ember-500' },
  review: { label: 'Review', chip: 'bg-gray-200 text-gray-700', rail: 'bg-gray-300' },
}

export default async function CurriculumPage({ params }: Props) {
  const { packageId } = await params

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageId)) {
    redirect('/org/dashboard')
  }

  // The guide is for whoever is actually running the sessions: the org owner
  // who bought the package, or a coach signed in to the class team it created.
  const [orgSession, teamSession] = await Promise.all([getOrgSession(), getTeamSession()])
  if (!orgSession && !teamSession) redirect('/org/login')

  const rows = (orgSession
    ? await db`
        SELECT p.id, p.player_count, p.created_at, o.name AS org_name
        FROM org_class_packages p
        JOIN organizations o ON o.id = p.org_id
        WHERE p.id = ${packageId} AND p.org_id = ${orgSession.orgId}
      `
    : await db`
        SELECT p.id, p.player_count, p.created_at, o.name AS org_name
        FROM org_class_packages p
        JOIN organizations o ON o.id = p.org_id
        JOIN teams t ON t.class_package_id = p.id
        WHERE p.id = ${packageId} AND t.id = ${teamSession!.teamId}
      `) as unknown as { id: string; player_count: number; created_at: string; org_name: string }[]

  if (!rows[0]) redirect(orgSession ? '/org/dashboard' : '/team/dashboard')
  const pkg = rows[0]

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .card { break-inside: avoid; }
          .page-break { page-break-before: always; }
          /* Force the intentional ember/ink fills to print where colour is load-bearing. */
          .print-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* The dark header would print white-on-white; flip it to ink-on-white for print. */
          .doc-header { background: #fff !important; border: 1px solid #e5e7eb; }
          .doc-header h1, .doc-header p { color: #111 !important; }
          .doc-header .brandmark { color: #e8430a !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-3xl mx-auto">

          <div className="no-print flex justify-end mb-6">
            <PrintButton />
          </div>

          {/* ── Cover ─────────────────────────────────────────────── */}
          <div className="doc-header bg-ink-950 rounded-2xl p-8 mb-8 text-white">
            <div className="brandmark text-ember-500 font-display font-black text-2xl tracking-tight mb-1">LearnHoops.com</div>
            <h1 className="font-display font-black text-3xl leading-tight mb-2">10-Week Shooting Development Program</h1>
            <p className="text-gray-400 text-sm">
              {pkg.org_name} &nbsp;·&nbsp; {pkg.player_count} Players &nbsp;·&nbsp; Coach&rsquo;s Session Guide
            </p>
          </div>

          {/* ── Program overview ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 card">
            <h2 className="font-display font-black text-lg mb-3">Program overview</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
              {[
                { k: 'Length', v: '10 weeks' },
                { k: 'Session', v: '60 minutes' },
                { k: 'Per basket', v: '4–6 players' },
                { k: 'Goal', v: 'All 18 criteria' },
              ].map(f => (
                <div key={f.k} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-center">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">{f.k}</p>
                  <p className="text-sm font-black text-black mt-0.5">{f.v}</p>
                </div>
              ))}
            </div>

            <p className="text-gray-600 text-sm leading-relaxed">
              Two LearnHoops criteria per week, each taught through a short physical demonstration, drilled at
              high repetition, and then defended in a game. Every week below is a ready-to-run coach sheet: the
              two skills, the exact 60-minute timeline, the phrases to say out loud, the mistakes you will see,
              and the finishing game. You are not being handed ideas — you are being handed the session.
            </p>

            <div className="print-color mt-4 rounded-lg bg-ink-950 text-white px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-ember-400 mb-1">Design principle</p>
              <p className="font-display font-black text-lg tracking-tight">Teach → Feel → Practice → Compete</p>
              <p className="text-gray-300 text-sm leading-relaxed mt-1">
                Players shouldn&rsquo;t spend 20 minutes listening. Demonstrations are 2–5 minutes, then the drill makes
                them <em>feel</em> the concept, then the game asks whether it survives competition.
              </p>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">The shape of every session</p>
              <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {HOUR.map((h, i) => (
                  <div key={h.t} className={`flex gap-3 px-3 py-2 text-sm ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                    <span className="shrink-0 w-14 font-black font-numeric text-ember-600 tabular-nums">{h.t}</span>
                    <span className="min-w-0">
                      <span className="text-gray-800 font-semibold">{h.label}</span>
                      <span className="block text-gray-500 text-xs leading-relaxed">{h.note}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-gray-500 text-xs leading-relaxed mt-2">
                Each week&rsquo;s sheet gives the exact minute-by-minute version of this.
              </p>
            </div>

            <div className="mt-4 rounded-lg bg-ember-500/10 border border-ember-500/20 border-l-4 border-l-ember-500 px-4 py-3">
              <p className="text-gray-800 text-sm leading-relaxed">
                <strong>Two required videos:</strong> the <strong>Week 1 baseline analysis</strong> and the
                <strong> Week 10 final analysis</strong>. The AI compares them to measure each player&rsquo;s improvement
                and generate their completion certificate — so film both the same way, from the side.
              </p>
            </div>
          </div>

          {/* ── Coaching rules ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 card">
            <h2 className="font-display font-black text-lg mb-1">Ten rules for all ten weeks</h2>
            <p className="text-gray-500 text-xs mb-4">Read these before Week 1. They matter more than any individual drill.</p>
            <ol className="space-y-2">
              {COACHING_RULES.map((r, i) => (
                <li key={r.rule} className="flex gap-3">
                  <span className="print-color shrink-0 w-6 h-6 rounded-full bg-ink-950 text-white text-[11px] font-black font-numeric flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="text-sm font-bold text-gray-900">{r.rule}</span>{' '}
                    <span className="text-sm text-gray-600 leading-relaxed">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* ── At-a-glance table ─────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 card">
            <h2 className="font-display font-black text-lg mb-1">The whole program at a glance</h2>
            <p className="text-gray-500 text-xs mb-4">Tape this to the gym wall.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wide text-gray-400 text-left">
                    <th className="pb-2 pr-3 font-numeric">Wk</th>
                    <th className="pb-2 pr-3">Shooting focus</th>
                    <th className="pb-2 pr-3">Signature lesson</th>
                    <th className="pb-2">Main game</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {PROGRAM_OVERVIEW.map(r => (
                    <tr key={r.week}>
                      <td className="py-2 pr-3 font-black font-numeric text-ember-600 tabular-nums align-top">{r.week}</td>
                      <td className="py-2 pr-3 text-gray-800 align-top">{r.focus}</td>
                      <td className="py-2 pr-3 text-gray-600 align-top">{r.signature}</td>
                      <td className="py-2 text-gray-600 align-top">{r.game}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Equipment + filming ───────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 card">
              <h2 className="font-display font-black text-lg mb-1">What to bring</h2>
              <p className="text-gray-500 text-xs mb-3">Everything the ten weeks ever ask for.</p>
              <ul className="space-y-2">
                {EQUIPMENT.map(e => (
                  <li key={e.item} className="flex gap-2.5">
                    <span className="print-color mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-ember-500" />
                    <span className="min-w-0">
                      <span className="text-sm font-bold text-gray-900">{e.item}</span>
                      <span className="block text-sm text-gray-600 leading-relaxed">{e.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 card">
              <h2 className="font-display font-black text-lg mb-1">Filming the two analyses</h2>
              <p className="text-gray-500 text-xs mb-3">Week 1 and Week 10. Get these right and the certificates take care of themselves.</p>
              <ol className="space-y-2">
                {FILMING.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                    <span className="text-ember-500 font-black font-numeric shrink-0 tabular-nums">{i + 1}.</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* ── Age adaptations ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 card">
            <h2 className="font-display font-black text-lg mb-1">Running it for your age group</h2>
            <p className="text-gray-500 text-xs mb-4">Same ten weeks, three different rooms. Each week&rsquo;s sheet also carries its own age notes.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {AGE_ADAPTATIONS.map(a => (
                <div key={a.band} className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                  <p className="font-black text-sm text-black">{a.band}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ember-600 mb-2">{a.range}</p>
                  <ul className="space-y-1.5">
                    {a.notes.map((n, i) => (
                      <li key={i} className="text-sm text-gray-600 leading-relaxed">{n}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* ── Where the method comes from ───────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 card">
            <h2 className="font-display font-black text-lg mb-1">Where this method comes from</h2>
            <p className="text-gray-500 text-xs mb-4">
              Two reference points behind the weekly order and the cues.
            </p>
            <div className="space-y-3">
              {PRO_NOTES.map(p => (
                <div key={p.who} className="rounded-lg border border-gray-200 p-4">
                  <p className="font-black text-sm text-black">{p.who}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ember-600 mb-1.5">{p.what}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{p.text}</p>
                  <p className="text-sm text-gray-500 leading-relaxed mt-1.5">
                    <span className="font-black uppercase tracking-wide text-[10px] text-gray-400 mr-1">In this program</span>
                    {p.use}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Weekly coach sheets — one printed page each ────────── */}
          <div className="space-y-6">
            {WEEKS.map((w) => (
              <div
                key={w.n}
                className={`page-break card bg-white rounded-xl border p-6 ${
                  w.required ? 'border-ember-500/40 ring-1 ring-ember-500/20' : 'border-gray-200'
                }`}
              >
                {/* Sheet header */}
                <div className="flex gap-4 items-start mb-4">
                  <div className="print-color shrink-0 w-14 h-14 rounded-2xl bg-ember-500 text-white flex flex-col items-center justify-center leading-none">
                    <span className="text-[9px] font-bold uppercase tracking-wide opacity-90">Week</span>
                    <span className="font-black font-numeric text-2xl">{w.n}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display font-black text-xl leading-tight">{w.title}</h3>
                      {w.required && (
                        <span className="print-color text-[10px] font-black uppercase tracking-wide bg-ember-500 text-white px-2 py-0.5 rounded-full">
                          Required video
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm mt-0.5">{w.goal}</p>
                  </div>
                </div>

                {/* Today's 2 skills */}
                <div className="mb-5">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">
                    Today&rsquo;s {w.skills.length === 1 ? 'focus' : '2 skills'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {w.skills.map(s => (
                      <span
                        key={s.num}
                        className="print-color inline-flex items-center gap-1.5 rounded-full bg-ink-950 text-white text-xs font-semibold pl-1.5 pr-3 py-1"
                      >
                        <span className="rounded-full bg-ember-500 text-white text-[10px] font-black font-numeric px-1.5 py-0.5 tabular-nums">#{s.num}</span>
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* The 60-minute timeline */}
                <div className="mb-5">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">The 60-minute session</p>
                  <div className="space-y-2.5">
                    {w.blocks.map(b => {
                      const st = BLOCK_STYLE[b.kind]
                      return (
                        <div key={b.time} className="flex gap-3">
                          <div className="shrink-0 w-[4.75rem] pt-0.5">
                            <p className="text-xs font-black font-numeric text-ember-600 tabular-nums leading-tight">{b.time}</p>
                          </div>
                          <div className={`print-color w-1 rounded-full shrink-0 ${st.rail}`} />
                          <div className="min-w-0 flex-1 pb-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`print-color text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${st.chip}`}>
                                {st.label}
                              </span>
                              <span className="font-bold text-sm text-gray-900">{b.title}</span>
                            </div>
                            {b.body.length > 0 && (
                              <ul className="space-y-1">
                                {b.body.map((line, i) => (
                                  <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                                    <span className="text-gray-300 shrink-0">·</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {b.say && b.say.length > 0 && (
                              <div className="mt-1.5 rounded bg-ember-500/10 border border-ember-500/20 border-l-4 border-l-ember-500 px-2.5 py-1.5">
                                <p className="text-[9px] font-black uppercase tracking-wide text-ember-700 mb-0.5">Say it out loud</p>
                                {b.say.map((s, i) => (
                                  <p key={i} className="text-sm text-ember-800 leading-relaxed">{s}</p>
                                ))}
                              </div>
                            )}
                            {b.scoring && (
                              <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                                <span className="font-black uppercase tracking-wide text-[10px] text-gray-400 mr-1">Scoring</span>
                                {b.scoring}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Mistakes */}
                <div className="mb-4 rounded-lg border border-gray-200 p-4">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">Common mistakes to look for</p>
                  <ul className="space-y-2">
                    {w.mistakes.map((m, i) => (
                      <li key={i} className="text-sm leading-relaxed">
                        <span className="block font-bold text-gray-900">{m.wrong}</span>
                        <span className="block text-gray-600">→ {m.fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Coach's options + age notes */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">Swap-ins &amp; alternatives</p>
                    <ul className="space-y-1.5">
                      {w.variations.map((v, i) => (
                        <li key={i} className="text-sm text-gray-700 leading-relaxed">{v}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">By age group</p>
                    <ul className="space-y-1.5">
                      {w.ageNotes.map(a => (
                        <li key={a.band} className="text-sm leading-relaxed">
                          <span className="font-black text-gray-900 font-numeric">{a.band}</span>{' '}
                          <span className="text-gray-600">{a.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {w.proNote && (
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed border-l-4 border-gray-200 pl-3">
                    <span className="font-black text-gray-900">{w.proNote.who}.</span> {w.proNote.text}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* ── Games library ─────────────────────────────────────── */}
          <div className="page-break card bg-white rounded-xl border border-gray-200 p-6 mt-6">
            <h2 className="font-display font-black text-lg mb-1">Games library</h2>
            <p className="text-gray-500 text-sm mb-4">
              Full rules for every game in the program. Swap any of these into any week — the only rule is that the
              week&rsquo;s two skills still have to count for something.
            </p>
            <div className="space-y-3">
              {GAMES_LIBRARY.map(g => (
                <div key={g.name} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                    <p className="font-black text-base text-black">{g.name}</p>
                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">{g.players}</span>
                  </div>
                  <dl className="space-y-1">
                    {[
                      { k: 'Setup', v: g.setup },
                      { k: 'Rules', v: g.rules },
                      { k: 'Why it works', v: g.why },
                    ].map(row => (
                      <div key={row.k} className="flex gap-2 text-sm leading-relaxed">
                        <dt className="shrink-0 w-24 text-[10px] font-black uppercase tracking-wide text-gray-400 pt-1">{row.k}</dt>
                        <dd className="text-gray-700 min-w-0">{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>

          {/* ── Criteria index ────────────────────────────────────── */}
          <div className="page-break card bg-white rounded-xl border border-gray-200 p-6 mt-6">
            <h2 className="font-display font-black text-lg mb-1">All 18 criteria — quick reference</h2>
            <p className="text-gray-500 text-sm mb-4">What the AI scores, and the week each one is taught.</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {CRITERIA_INDEX.map((c, i) => (
                <div key={c.num} className={`flex gap-3 px-3 py-2 text-sm ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                  <span className="print-color shrink-0 w-9 text-center rounded bg-ember-500 text-white text-[11px] font-black font-numeric py-0.5 tabular-nums self-start">
                    {c.num}
                  </span>
                  <span className="flex-1 min-w-0 text-gray-800">{c.name}</span>
                  <span className="shrink-0 text-xs font-bold text-gray-400 font-numeric">Wk {c.week}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 text-center text-gray-400 text-xs no-print">
            LearnHoops.com &nbsp;·&nbsp; Generated for {pkg.org_name}
          </div>

        </div>
      </div>
    </>
  )
}
