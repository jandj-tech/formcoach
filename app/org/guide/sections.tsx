import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Table of contents — the single source of truth for section ids, order and
// titles. page.tsx renders the TOC from this list and each Section below uses
// the matching id, so an anchor can never point at a heading that moved.
// ─────────────────────────────────────────────────────────────────────────────
export const GUIDE_SECTIONS = [
  { id: 'getting-started', title: 'Getting started' },
  { id: 'teams-coaches', title: 'Teams & coaches' },
  { id: 'adding-players', title: 'Adding players' },
  { id: 'uploading', title: 'Uploading & evaluating shots' },
  { id: 'viewing-scores', title: 'Viewing scores' },
  { id: 'sending-results', title: 'Sending results to players (the weekly routine)' },
  { id: 'what-players-see', title: 'Choosing what players see' },
  { id: 'locking-results', title: 'Locking results behind payment' },
  { id: 'selling', title: 'Selling to families — products & pricing' },
  { id: 'payments', title: 'Payments, sales & your earnings' },
  { id: 'coach-led-program', title: 'The Coach-Led Development Program' },
  { id: 'editing-evaluation', title: 'Editing an evaluation (coach notes)' },
  { id: 'org-settings', title: 'Organization settings' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
] as const

type SectionId = (typeof GUIDE_SECTIONS)[number]['id']

function sectionNumber(id: SectionId): number {
  return GUIDE_SECTIONS.findIndex(s => s.id === id) + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks. Every section is made of the same handful of pieces so the
// whole guide reads with one rhythm: heading → "What this does" → Steps →
// callouts and a small mock-UI figure where a picture helps.
// ─────────────────────────────────────────────────────────────────────────────

export function Section({
  id,
  what,
  children,
}: {
  id: SectionId
  what: ReactNode
  children: ReactNode
}) {
  const meta = GUIDE_SECTIONS.find(s => s.id === id)!
  const num = sectionNumber(id)
  return (
    <section id={id} className="guide-section scroll-mt-24 mb-14">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-numeric font-black text-orange-500 text-xl tabular-nums shrink-0">
          {String(num).padStart(2, '0')}
        </span>
        <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-black leading-tight">
          {meta.title}
        </h2>
      </div>
      <p className="text-gray-700 leading-relaxed mb-5">
        <span className="font-black text-black">What this does.</span> {what}
      </p>
      {children}
    </section>
  )
}

export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="font-display font-black text-lg text-black mt-8 mb-3">{children}</h3>
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-gray-700 text-sm leading-relaxed mb-4">{children}</p>
}

export function Steps({ title = 'Steps', items }: { title?: string; items: ReactNode[] }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">{title}</p>
      <ol className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="print-color shrink-0 w-6 h-6 mt-0.5 rounded-full bg-orange-500 text-white text-[11px] font-black font-numeric flex items-center justify-center tabular-nums">
              {i + 1}
            </span>
            <span className="text-gray-800 text-sm leading-relaxed min-w-0">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const CALLOUT_STYLE = {
  tip: { box: 'bg-orange-50 border border-orange-200', label: 'Tip', text: 'text-orange-700' },
  important: { box: 'bg-red-50 border border-red-200', label: 'Important', text: 'text-red-700' },
  trouble: { box: 'bg-gray-50 border border-gray-200', label: 'If something goes wrong', text: 'text-gray-700' },
} as const

export function Callout({ kind, children }: { kind: keyof typeof CALLOUT_STYLE; children: ReactNode }) {
  const s = CALLOUT_STYLE[kind]
  return (
    <div className={`${s.box} rounded-xl p-4 mb-5 text-sm text-gray-800 leading-relaxed`}>
      <p className={`text-[11px] font-black uppercase tracking-wide ${s.text} mb-1`}>{s.label}</p>
      {children}
    </div>
  )
}

export function Figure({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="mb-5">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 overflow-x-auto">
        {children}
      </div>
      {caption && <figcaption className="text-[11px] text-gray-500 mt-1.5">{caption}</figcaption>}
    </figure>
  )
}

const CHIP_TONE = {
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
} as const

export function Chip({ tone = 'gray', children }: { tone?: keyof typeof CHIP_TONE; children: ReactNode }) {
  return (
    <span className={`print-color inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${CHIP_TONE[tone]}`}>
      {children}
    </span>
  )
}

export function MockButton({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return (
    <span
      className={`print-color inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-bold border whitespace-nowrap ${
        primary ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-300 text-gray-800'
      }`}
    >
      {children}
    </span>
  )
}

export function MockTabs({ tabs, active }: { tabs: readonly string[]; active: string }) {
  return (
    <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-1">
      {tabs.map(t => (
        <span
          key={t}
          className={`print-color rounded-md px-2 py-1 text-[11px] font-bold whitespace-nowrap ${
            t === active ? 'bg-black text-white' : 'text-gray-600'
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

function MockField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-800 truncate">{value}</div>
    </div>
  )
}

function MockToggle({ on }: { on: boolean }) {
  return (
    <span className={`print-color inline-flex items-center gap-1.5 text-[11px] font-bold ${on ? 'text-green-700' : 'text-gray-500'}`}>
      <span className={`inline-block w-7 h-4 rounded-full relative ${on ? 'bg-green-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
      {on ? 'On' : 'Off'}
    </span>
  )
}

const DASHBOARD_TABS = [
  'Teams',
  'Schedule',
  'Coach-Led Program',
  'Tokens',
  'Leaderboard',
  'Players',
  'Results',
  'Offers & Sales',
  'Purchases',
  'My Uploads',
  'Settings',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Weekly checklist — sits near the top of the page as the one-page summary.
// ─────────────────────────────────────────────────────────────────────────────
export function WeeklyChecklist() {
  const steps: Array<{ label: string; detail: string; href: SectionId }> = [
    { label: 'Upload', detail: 'Film one shot per player and upload it (upload link or Upload for a player).', href: 'uploading' },
    { label: 'Wait for grades', detail: 'Each shot is graded in about a minute.', href: 'uploading' },
    { label: 'Results tab', detail: 'Choose a team. Check every status chip.', href: 'sending-results' },
    { label: 'Preview', detail: 'Preview email, then Open the player’s view.', href: 'sending-results' },
    { label: 'Send', detail: 'Tick the players and press Send results to N players.', href: 'sending-results' },
    { label: 'Watch Sales', detail: 'Offers & Sales tab shows who bought what.', href: 'payments' },
  ]
  return (
    <div className="guide-section rounded-2xl border-2 border-orange-500 bg-white p-5 sm:p-6 mb-12">
      <p className="text-[11px] font-black uppercase tracking-widest text-orange-600 mb-1">One-page summary</p>
      <h2 className="font-display font-black text-2xl text-black mb-4">Weekly checklist</h2>
      <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-3">
            <span className="print-color shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white font-black font-numeric text-sm flex items-center justify-center tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0">
              <a href={`#${s.href}`} className="block font-black text-black text-sm hover:text-orange-600">
                {s.label}
              </a>
              <span className="block text-gray-600 text-xs leading-relaxed">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-gray-500 text-xs mt-4 leading-relaxed">
        Upload &rarr; Wait for grades &rarr; <b>Results</b> tab &rarr; <b>Preview email</b> &rarr; <b>Send</b> &rarr; Watch <b>Offers &amp; Sales</b>.
        Do this once a week and every family gets a fresh score in their inbox.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Getting started
// ─────────────────────────────────────────────────────────────────────────────
export function GettingStarted() {
  return (
    <Section
      id="getting-started"
      what="Creates your club&apos;s organization account and shows you what is on the dashboard."
    >
      <Sub>Create your organization</Sub>
      <Steps
        items={[
          <>Open <b>learnhoops.com/org/pricing</b> in your web browser.</>,
          <>Choose a plan: <b>Basic</b> ($12.99 a month, 1 team) or <b>Plus</b> ($26.49 a month, unlimited teams).</>,
          <>Fill in the sign-up form with your club name, your name and your email address.</>,
          <>Pay by card.</>,
          <>You land on your <b>Organization dashboard</b>. Bookmark it: <b>learnhoops.com/org/dashboard</b>.</>,
        ]}
      />
      <Callout kind="tip">
        Start on <b>Basic</b> if you run one team. You can move to <b>Plus</b> later from the dashboard when you add a second team.
      </Callout>

      <Sub>Log in</Sub>
      <Steps
        items={[
          <>Go to <b>learnhoops.com/login</b>.</>,
          <>Enter the email and password you used at sign-up and sign in.</>,
          <>You arrive on the <b>Organization dashboard</b>.</>,
        ]}
      />

      <Sub>The dashboard at a glance</Sub>
      <P>
        The top of the dashboard shows four headline cards. The most important one is your <b>Organization code</b>.
        Coaches type this code to link their team to your club. Under the cards is a row of tabs. Everything in this
        guide lives in one of those tabs.
      </P>
      <Figure caption="The headline cards and the tab strip on your Organization dashboard.">
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { k: 'Organization code', v: 'MAPLE24' },
            { k: 'Teams', v: '3' },
            { k: 'Players', v: '41' },
            { k: 'Org credits', v: '120' },
          ].map(c => (
            <div key={c.k} className="rounded-lg bg-white border border-gray-200 px-2 py-1.5 text-center">
              <p className="text-[9px] font-black uppercase tracking-wide text-gray-400 truncate">{c.k}</p>
              <p className="text-sm font-black font-numeric text-black">{c.v}</p>
            </div>
          ))}
        </div>
        <MockTabs tabs={DASHBOARD_TABS} active="Teams" />
      </Figure>
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {[
              ['Teams', 'Add teams, add coaches, open a team’s own dashboard.'],
              ['Schedule', 'Practice and game schedule for your teams.'],
              ['Coach-Led Program', 'The separate 10-week coach-run package (see section 11).'],
              ['Tokens', 'Buy analysis tokens and hand them out to teams, coaches or players.'],
              ['Leaderboard', 'Every graded player across the whole club, ranked.'],
              ['Players', 'Every player on every roster.'],
              ['Results', 'New. Email each player their latest score and a private link.'],
              ['Offers & Sales', 'New. Three sections at the top: Offers, What players see, Sales & earnings.'],
              ['Purchases', 'Your token and plan purchases.'],
              ['My Uploads', 'Shots you uploaded yourself.'],
              ['Settings', 'Appearance (light or dark).'],
            ].map(([tab, desc]) => (
              <tr key={tab}>
                <td className="py-2 px-3 font-black text-black whitespace-nowrap align-top w-40">{tab}</td>
                <td className="py-2 px-3 text-gray-600 align-top">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Teams & coaches
// ─────────────────────────────────────────────────────────────────────────────
export function TeamsCoaches() {
  return (
    <Section id="teams-coaches" what="Sets up the teams inside your club and gives each coach access to their own team.">
      <Sub>Add a team yourself</Sub>
      <Steps
        items={[
          <>Open the <b>Teams</b> tab.</>,
          <>Click <b>Add a team</b>.</>,
          <>Type the team name and pick the age group.</>,
          <>Save. The new team appears as a card in the <b>Teams</b> tab.</>,
        ]}
      />

      <Sub>Or let a coach register their own team</Sub>
      <Steps
        items={[
          <>Send the coach your <b>Organization code</b> (top of the dashboard).</>,
          <>The coach goes to <b>learnhoops.com/team</b> and registers a team.</>,
          <>The coach enters your <b>Organization code</b> during registration.</>,
          <>The team appears in your <b>Teams</b> tab, linked to your club.</>,
        ]}
      />

      <Sub>Add a coach to a team</Sub>
      <Steps
        items={[
          <>In the <b>Teams</b> tab, find the team card.</>,
          <>Click <b>Add coach</b>.</>,
          <>Either type the coach&apos;s email to send an invite, or copy the invite link and send it yourself.</>,
          <>The coach follows the link and gets access to that team.</>,
        ]}
      />

      <Sub>Open a team&apos;s own dashboard</Sub>
      <Steps
        items={[
          <>On the team card, click <b>Open team dashboard</b>.</>,
          <>You now see exactly what the coach sees: roster, uploads, leaderboard, schedule.</>,
        ]}
      />
      <Figure caption="A team card in the Teams tab.">
        <div className="rounded-lg bg-white border border-gray-200 p-3">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-black text-sm text-black">U13 Girls</p>
              <p className="text-[10px] text-gray-500">Age group U13 &middot; 12 players &middot; access code <b className="font-numeric">7K2PQX</b></p>
            </div>
            <Chip tone="green">2 coaches</Chip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MockButton primary>Open team dashboard</MockButton>
            <MockButton>Add coach</MockButton>
            <MockButton>Leaderboard</MockButton>
            <MockButton>Roster</MockButton>
          </div>
        </div>
      </Figure>
      <Callout kind="tip">
        The six-character <b>access code</b> on the team card is the team&apos;s code. Players use it to join (next section) and it is part of the team&apos;s upload link.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Adding players
// ─────────────────────────────────────────────────────────────────────────────
export function AddingPlayers() {
  return (
    <Section id="adding-players" what="Gets each player onto a team roster so their shots, scores and emails are tied to them.">
      <P>There are three ways to put a player on a roster. The first one is the best, because it gives the player an account with an email address.</P>

      <Sub>Way 1 — Share the team join link (recommended)</Sub>
      <Steps
        items={[
          <>Open the <b>Teams</b> tab and find the team card. Note the team&apos;s access code.</>,
          <>The join link is <b>learnhoops.com/signup?teamCode=XXXXXX</b>, where XXXXXX is the team&apos;s access code.</>,
          <>Send that link to the players or their parents (text message, email or a team group chat).</>,
          <>The player or parent opens the link and creates a free account.</>,
          <>They appear on the roster with an email address. Results can be emailed to them.</>,
        ]}
      />

      <Sub>Way 2 — Upload a video and type the player&apos;s name</Sub>
      <Steps
        items={[
          <>When you upload a shot (section 4), type the player&apos;s first name and last initial.</>,
          <>LearnHoops creates a <b>name-only</b> player on the roster.</>,
        ]}
      />
      <Callout kind="important">
        A <b>name-only player has no email address</b>. Their scores are saved, but the <b>Results</b> tab cannot email them anything.
        The <b>Results</b> tab shows them as <Chip tone="orange">No email — share join link</Chip>. Fix it by sending the family the join
        link from Way 1. When they create an account, their history is on their roster entry.
      </Callout>

      <Sub>Way 3 — Invites</Sub>
      <Steps
        items={[
          <>From the team dashboard, invite a player by email.</>,
          <>The player accepts the invite and lands on the roster with an email address.</>,
        ]}
      />
      <Figure caption="Two roster rows: one with an account, one name-only.">
        <div className="rounded-lg bg-white border border-gray-200 divide-y divide-gray-100">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div>
              <p className="font-bold text-black">Ava R.</p>
              <p className="text-[10px] text-gray-500">ava.parent@example.com</p>
            </div>
            <Chip tone="green">Sent Sep 1</Chip>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div>
              <p className="font-bold text-black">Marcus T.</p>
              <p className="text-[10px] text-gray-500">Name only</p>
            </div>
            <Chip tone="orange">No email — share join link</Chip>
          </div>
        </div>
      </Figure>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Uploading & evaluating shots
// ─────────────────────────────────────────────────────────────────────────────
export function Uploading() {
  return (
    <Section id="uploading" what="Turns a short video of one jump shot into a graded report. Each upload uses one token.">
      <Sub>How to film</Sub>
      <Steps
        title="Filming rules"
        items={[
          <>One video = one shot. Do not film a string of shots in one clip.</>,
          <>Film from the <b>front</b>: put the camera under or just behind the basket, looking back at the shooter.</>,
          <>Keep the <b>whole body</b> in frame, head to feet, from the set-up through the release.</>,
          <>Stand close enough that you can see the hands and elbow. Do not film from across the gym.</>,
          <>Good light, steady camera.</>,
        ]}
      />
      <Callout kind="tip">
        The full filming guide with an example clip is at <b>learnhoops.com/support#filming</b>. Share it with parents who film at home.
      </Callout>

      <Sub>Way 1 — The team upload link (kiosk style)</Sub>
      <P>Best for practice: set up one phone or tablet by the basket and let players line up.</P>
      <Steps
        items={[
          <>Open <b>learnhoops.com/team/TEAMCODE/upload</b>, replacing TEAMCODE with the team&apos;s access code.</>,
          <>Type the player&apos;s name.</>,
          <>Upload the video.</>,
          <>Repeat for the next player. The player does <b>not</b> see their result on this screen; it goes to the roster and to the <b>Results</b> tab.</>,
        ]}
      />

      <Sub>Way 2 — Upload for a player from the team dashboard</Sub>
      <Steps
        items={[
          <>In the <b>Teams</b> tab, click <b>Open team dashboard</b> on the team card.</>,
          <>Click <b>Upload for a player</b>.</>,
          <>Pick the player from the roster.</>,
          <>Upload the video. Grading takes about a minute.</>,
        ]}
      />

      <Sub>Tokens — what an upload costs</Sub>
      <P>Every analysis costs <b>1 token</b> (also called a credit). Your club buys tokens once and hands them out.</P>
      <Steps
        items={[
          <>Open the <b>Tokens</b> tab.</>,
          <>Click <b>Buy tokens</b>. Buying 10 or more gets the organization bulk rate of <b>$2.49 each</b>. Tokens are bought on the website only, not in the iOS app.</>,
          <>Hand tokens out with the <b>Send</b> panel: send them to a player, or to a coach&apos;s credits so the coach can upload for anyone on their roster.</>,
          <>Or click <b>Allocate to team</b> to give a team a block of tokens.</>,
        ]}
      />
      <Figure caption="The Tokens tab: balance, Buy tokens, and the Send panel.">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wide text-gray-400">Org credits</p>
            <p className="text-lg font-black font-numeric text-black">120</p>
          </div>
          <MockButton primary>Buy tokens</MockButton>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-2.5">
          <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Send</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <MockField label="To" value="U13 Girls — Coach Lee" />
            <MockField label="Tokens" value="12" />
            <MockButton>Send</MockButton>
          </div>
        </div>
      </Figure>
      <Callout kind="trouble">
        Video will not upload? Check that it is one shot, under a few minutes long, in a common phone video format, and filmed in good light. Try again on Wi-Fi.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Viewing scores
// ─────────────────────────────────────────────────────────────────────────────
export function ViewingScores() {
  return (
    <Section id="viewing-scores" what="Shows you every graded shot, from a club-wide ranking down to one player&apos;s full report.">
      <Sub>What a report contains</Sub>
      <P>
        Every graded shot gets one <b>overall score out of 10</b> with a <b>letter grade</b>, then <b>18 individual checks</b> grouped in
        five areas: <b>Base &amp; Balance</b>, <b>Grip &amp; Set</b>, <b>Release</b>, <b>Follow-Through</b> and <b>Power &amp; Flow</b>.
        Each check has written feedback. The report also carries coach notes, improvement tips and the frames pulled from the video.
      </P>
      <Figure caption="The top of a report: overall score, grade and the five areas.">
        <div className="flex items-center gap-3 mb-2">
          <div className="print-color w-14 h-14 rounded-xl bg-black text-white flex flex-col items-center justify-center leading-none">
            <span className="text-xl font-black font-numeric">7.4</span>
            <span className="text-[9px] font-bold text-orange-400 mt-0.5">B</span>
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm text-black">Ava R. &middot; Sep 3</p>
            <p className="text-[10px] text-gray-500">18 checks &middot; 5 areas &middot; frames attached</p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {[
            ['Base & Balance', '8.1'],
            ['Grip & Set', '7.0'],
            ['Release', '6.8'],
            ['Follow-Through', '7.9'],
            ['Power & Flow', '7.2'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-white border border-gray-200 px-1.5 py-1 text-center">
              <p className="text-[8px] font-black uppercase tracking-wide text-gray-400 leading-tight">{k}</p>
              <p className="text-xs font-black font-numeric text-black">{v}</p>
            </div>
          ))}
        </div>
      </Figure>

      <Sub>Club-wide</Sub>
      <Steps
        items={[
          <>Open the <b>Leaderboard</b> tab.</>,
          <>Every graded player in your club is ranked by their latest score.</>,
        ]}
      />

      <Sub>One team</Sub>
      <Steps
        items={[
          <>In the <b>Teams</b> tab, click <b>Leaderboard</b> or <b>Roster</b> on the team card.</>,
          <>Click a player&apos;s row to open their shot history.</>,
          <>Click any shot to open the full report: score, grade, the five areas, all 18 checks and any flags.</>,
        ]}
      />
      <Callout kind="tip">
        The <b>Players</b> tab lists every player across every team. Use it when you know the name but not the team.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Sending results to players (the weekly routine)
// ─────────────────────────────────────────────────────────────────────────────
export function SendingResults() {
  return (
    <Section
      id="sending-results"
      what="Emails each player (or parent) their latest score with a private link to their report. This is the new Results tab."
    >
      {/* screenshot: results-tab.png */}
      <Steps
        items={[
          <>Open the <b>Results</b> tab.</>,
          <>Click <b>Choose a team</b> and pick the team.</>,
          <>You see every player, their latest score, when it was graded, and a status chip (explained below).</>,
          <>Tick the players you want to email, or click <b>Select all</b>.</>,
          <>Click <b>Preview email</b>. This shows the exact email a player will get.</>,
          <>Click <b>Open the player&apos;s view</b>. The report opens exactly as the player will see it. A bar at the top lets you step through each visibility level, so you can see what is free and what is locked.</>,
          <>Click <b>Send results to N players</b> (N is how many you ticked).</>,
          <>Confirm. Each player gets an email with their score and a private link to their report.</>,
        ]}
      />
      <Figure caption="The Results tab after choosing a team.">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <MockField label="Team" value="U13 Girls" />
          </div>
          <MockButton primary>Send results to 3 players</MockButton>
        </div>
        <p className="text-[10px] text-gray-500 mb-2">
          Players see: <b>Main score only</b> &middot; Unlock: <b>Full results including comments</b> &middot; <span className="underline">Change in Offers</span>
        </p>
        <div className="rounded-lg bg-white border border-gray-200 divide-y divide-gray-100">
          {[
            { name: 'Ava R.', score: '7.4', when: 'Sep 3', chip: <Chip tone="green">Sent Sep 1</Chip>, checked: true },
            { name: 'Jordan P.', score: '6.1', when: 'Sep 3', chip: <Chip tone="gray">Not sent</Chip>, checked: true },
            { name: 'Marcus T.', score: '8.0', when: 'Sep 2', chip: <Chip tone="orange">No email — share join link</Chip>, checked: false },
            { name: 'Sam K.', score: '7.9', when: 'Sep 3', chip: <Chip tone="blue">Unlocked</Chip>, checked: true },
          ].map(r => (
            <div key={r.name} className="flex items-center gap-2 px-3 py-1.5">
              <span className={`print-color w-3.5 h-3.5 rounded border ${r.checked ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-300'}`} />
              <span className="font-bold text-black w-24 truncate">{r.name}</span>
              <span className="font-numeric font-black text-black w-8">{r.score}</span>
              <span className="text-gray-500 w-12">{r.when}</span>
              <span className="flex-1 flex justify-end">{r.chip}</span>
              <MockButton>Resend</MockButton>
            </div>
          ))}
        </div>
      </Figure>

      <Sub>What the status chips mean</Sub>
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {[
              { chip: <Chip tone="gray">Not sent</Chip>, text: 'This player has a graded shot you have not emailed yet.' },
              { chip: <Chip tone="green">Sent Sep 1</Chip>, text: 'The email went out on that date.' },
              { chip: <Chip tone="blue">Unlocked</Chip>, text: 'The family bought an upgrade. They see the unlocked level.' },
              { chip: <Chip tone="orange">No email — share join link</Chip>, text: 'Name-only player. Send the join link (section 3) so they can get emails.' },
              { chip: <Chip tone="red">Unsubscribed</Chip>, text: 'They opted out of LearnHoops email. We cannot email them; tell them in person.' },
              { chip: <Chip tone="red">Bounced</Chip>, text: 'Their email address rejected a message. The address must be fixed on their account.' },
            ].map((r, i) => (
              <tr key={i}>
                <td className="py-2 px-3 align-top whitespace-nowrap">{r.chip}</td>
                <td className="py-2 px-3 text-gray-600 align-top">{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sub>Resending</Sub>
      <Steps
        items={[
          <>Find the player&apos;s row in the <b>Results</b> tab.</>,
          <>Click <b>Resend</b>. The same private link is sent again, and the free-visibility level is refreshed to your current setting.</>,
        ]}
      />
      <Callout kind="important">
        There is a limit of about <b>20 sends per hour per organization</b>. If you hit it, the tab tells you. Wait an hour and send the rest.
      </Callout>
      <Callout kind="tip">
        The line <b>Players see: … · Unlock: …</b> above the list shows your current visibility settings. Click <b>Change in Offers</b> to adjust them before you send (section 7).
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Choosing what players see
// ─────────────────────────────────────────────────────────────────────────────
const LEVELS = [
  ['Main score only', 'The overall score out of 10 and the letter grade. Nothing else.'],
  ['Score + category scores', 'Adds the five area scores (Base & Balance, Grip & Set, Release, Follow-Through, Power & Flow).'],
  ['Full score breakdown', 'Adds all 18 individual check scores.'],
  ['Full results including comments', 'Everything: written feedback per check, coach notes, tips and frames.'],
] as const

export function WhatPlayersSee() {
  return (
    <Section
      id="what-players-see"
      what="Decides how much of the report a family sees for free from the email, and how much they see if they buy an upgrade."
    >
      <Steps
        items={[
          <>Open the <b>Offers &amp; Sales</b> tab.</>,
          <>Click <b>What players see</b> at the top of the tab.</>,
          <>Under <b>Free with the email</b>, choose one of the four levels below.</>,
          <>Under <b>After they buy</b>, choose one of the same four levels.</>,
          <>Click <b>Save</b>.</>,
          <>Check it: go to the <b>Results</b> tab and click <b>Open the player&apos;s view</b>. Use the bar at the top to step through the levels.</>,
        ]}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wide text-gray-400 text-left bg-gray-50">
              <th className="py-2 px-3">Level</th>
              <th className="py-2 px-3">What the family sees</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {LEVELS.map(([k, v]) => (
              <tr key={k}>
                <td className="py-2 px-3 font-black text-black whitespace-nowrap align-top">{k}</td>
                <td className="py-2 px-3 text-gray-600 align-top">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Figure caption="The What players see card.">
        <div className="rounded-lg bg-white border border-gray-200 p-3">
          <p className="font-black text-sm text-black mb-2">What players see</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MockField label="Free with the email" value="Full results including comments" />
            <MockField label="After they buy" value="Full results including comments" />
          </div>
          <MockButton primary>Save</MockButton>
        </div>
      </Figure>
      <Callout kind="tip">
        The default is <b>Full</b> for both. That means <b>no paywall</b>: families get the whole report for free. Leave it that way if you do not plan to sell anything.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Locking results behind payment
// ─────────────────────────────────────────────────────────────────────────────
export function LockingResults() {
  return (
    <Section
      id="locking-results"
      what="Creates a paywall: families see part of the report for free and can pay to unlock the rest."
    >
      <P>
        A paywall exists whenever the <b>Free with the email</b> level is <b>lower</b> than the <b>After they buy</b> level.
        The gap between the two is what a family is paying for.
      </P>
      <Steps
        items={[
          <>Make sure at least one offer is turned <b>On</b> (section 9). Otherwise families would see less and have nothing to buy.</>,
          <>Open the <b>Offers &amp; Sales</b> tab and click <b>What players see</b> at the top.</>,
          <>Set <b>Free with the email</b> to a lower level, for example <b>Main score only</b> or <b>Score + category scores</b>.</>,
          <>Set <b>After they buy</b> to <b>Full results including comments</b>.</>,
          <>Click <b>Save</b>.</>,
          <>Go to the <b>Results</b> tab and click <b>Open the player&apos;s view</b>. Step through the bar at the top to confirm what is free and what is locked.</>,
          <>Send results as usual (section 6). Below the free part of the report, families now see your offers with a <b>Buy</b> button.</>,
        ]}
      />
      <Figure caption="How a family sees a locked report: score is free, the rest sits behind the offers.">
        <div className="flex items-center gap-3 mb-2">
          <div className="print-color w-12 h-12 rounded-xl bg-black text-white flex flex-col items-center justify-center leading-none">
            <span className="text-lg font-black font-numeric">7.4</span>
            <span className="text-[9px] font-bold text-orange-400 mt-0.5">B</span>
          </div>
          <div>
            <p className="font-black text-sm text-black">Your score</p>
            <p className="text-[10px] text-gray-500">Free with the email</p>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-2.5 mb-2 text-center text-gray-400">
          18 checks &middot; written feedback &middot; tips &middot; frames &mdash; <b>locked</b>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-2.5 flex items-center justify-between gap-2">
          <div>
            <p className="font-black text-black">Full Shot Breakdown</p>
            <p className="text-[10px] text-gray-500"><s>$49.99</s> <b className="text-black">$29.99</b> club price</p>
          </div>
          <MockButton primary>Buy</MockButton>
        </div>
      </Figure>
      <Callout kind="important">
        An offer must be turned <b>On</b> (section 9) before lowering the free level does anything but hide information — otherwise players see the lower level with nothing to buy.
      </Callout>
      <Callout kind="tip">
        <b>Score + category scores</b> is a good free level. Families see the number and where the shot is strong or weak, and the detail behind it is what they buy.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Selling to families — products & pricing
// ─────────────────────────────────────────────────────────────────────────────
export function Selling() {
  return (
    <Section
      id="selling"
      what="Lets families buy things from their results page: the full breakdown, a LearnHoops ball, your Shooting Class, or bundles, at prices you set."
    >
      <Sub>How the money works</Sub>
      <P>
        Families pay LearnHoops by card. LearnHoops keeps its share and pays the rest to your club. The share is never hidden: every
        offer shows <b>Families pay · LearnHoops keeps · You get</b> right on its card, and every sale email repeats it.
      </P>
      <Callout kind="tip">
        <b>Shooting Class sign-ups:</b> LearnHoops keeps a fixed <b>$100</b> per player who signs up, and your club gets the rest. For
        example, a $300 class = $100 to LearnHoops, $200 to you. <b>Balls:</b> LearnHoops supplies and ships the ball, so it keeps a fixed
        <b> $20</b> per ball (its cost plus part of the shipping) and your club keeps everything you charge above that. Other offers use a percent.
      </Callout>

      <Sub>Step 1 — Check the status bar</Sub>
      <P>Selling is switched on automatically for every organization with an active plan — there is nothing to apply for.</P>
      <Steps
        items={[
          <>Open the <b>Offers &amp; Sales</b> tab.</>,
          <>The status bar at the top reads <b>Selling on</b> and shows LearnHoops&apos; share. If it says <b>Selling needs an active plan</b>, renew your plan from the plan section on the dashboard, or update your card under <b>Settings → Billing</b>.</>,
          <>Use <b>Copy your shop link</b> to get a page you can text or email to families who want the class before any shot is graded.</>,
        ]}
      />
      <Callout kind="tip">
        Visibility settings and sending results work right away too. Every offer starts <b>Off</b> until you flip it on.
      </Callout>

      <Sub>Step 2 — Review the four draft offers</Sub>
      <P>Four offers are pre-created for you, all switched <b>Off</b>, with draft prices. Review every price before you turn anything on. Nothing is final until you say so.</P>
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wide text-gray-400 text-left bg-gray-50">
              <th className="py-2 px-3">Offer</th>
              <th className="py-2 px-3">What the family gets</th>
              <th className="py-2 px-3 whitespace-nowrap">Draft club price</th>
              <th className="py-2 px-3 whitespace-nowrap">Draft regular</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[
              ['Full Shot Breakdown', 'Unlocks the full report for that one shot.', '$29.99', '$49.99'],
              ['LearnHoops Ball + Full Analysis', 'A LearnHoops ball shipped to the family by LearnHoops, plus the full report.', '$50', '$79.99'],
              ['Shooting Class', 'Registration for your own shooting class.', '$300', '$399'],
              ['Shooting Class + Ball', 'The class and the ball together.', 'You set it', 'You set it'],
            ].map(([n, d, c, r]) => (
              <tr key={n}>
                <td className="py-2 px-3 font-black text-black align-top whitespace-nowrap">{n}</td>
                <td className="py-2 px-3 text-gray-600 align-top">{d}</td>
                <td className="py-2 px-3 font-numeric text-black align-top">{c}</td>
                <td className="py-2 px-3 font-numeric text-gray-500 align-top">{r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sub>Step 3 — Edit an offer</Sub>
      <Steps
        items={[
          <>In the <b>Offers &amp; Sales</b> tab, make sure <b>Offers</b> is selected at the top, then click <b>Edit</b> on the offer.</>,
          <>Edit the <b>Name</b> and <b>Description</b> families will read.</>,
          <>Set the <b>Regular price</b>. Families see this crossed out.</>,
          <>Set the <b>Club price</b>. This is what your families actually pay.</>,
          <>Optionally set a <b>Discount price</b> for a short promotion. It must beat the club price.</>,
          <>Tick what the offer <b>Includes</b>: <b>Full breakdown</b>, <b>LearnHoops ball</b>, <b>Shooting Class</b>.</>,
          <>Under <b>After purchase, unlock</b>, pick <b>This report only</b> or <b>All this player&apos;s reports</b>.</>,
          <>Check the line <b>Families pay · LearnHoops keeps · You get</b> under the prices — that is exactly how each sale splits.</>,
          <>Click <b>Save</b>.</>,
          <>Flip the switch to <b>On</b>.</>,
        ]}
      />
      <Figure caption="An offer card in the Offers & Sales tab, opened with Edit.">
        <div className="rounded-lg bg-white border border-gray-200 p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="font-black text-sm text-black">Shooting Class</p>
            <MockToggle on />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <MockField label="Regular price" value="$399" />
            <MockField label="Club price" value="$300" />
            <MockField label="Discount price" value="—" />
          </div>
          <p className="text-[11px] text-gray-700 mb-2">
            Families pay <b>$300</b> · LearnHoops keeps <b>$100</b> · You get <b>$200</b>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] text-gray-700">
            <span className="font-black text-gray-400 uppercase text-[10px] tracking-wide w-full">Includes</span>
            <span>&#9744; Full breakdown</span>
            <span>&#9744; LearnHoops ball</span>
            <span>&#9745; Shooting Class</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <MockField label="After purchase, unlock" value="All this player’s reports" />
            <MockField label="Team join link" value="U13 Girls" />
          </div>
          <div className="flex gap-1.5">
            <MockButton primary>Save</MockButton>
            <MockButton>Delete</MockButton>
          </div>
        </div>
      </Figure>

      <Sub>Regular vs club vs discount price</Sub>
      <P>
        Example: you set <b>Regular price $299</b> and <b>Club price $199</b>. The family sees <s>$299</s> <b>$199</b>. The crossed-out
        number shows them the value; the club price is what they pay. If you also set a <b>Discount price</b> of $149 for one week,
        they see $149 that week and $199 after you clear it.
      </P>
      <Figure caption="How the same offer looks to a family.">
        <div className="rounded-lg bg-white border border-gray-200 p-2.5 flex items-center justify-between gap-2">
          <div>
            <p className="font-black text-black">Shooting Class</p>
            <p className="text-[10px] text-gray-500">10 sessions with your club&apos;s coaches</p>
            <p className="mt-0.5"><s className="text-gray-400">$299</s> <b className="text-black text-sm">$199</b> <span className="text-[10px] text-gray-500">club price</span></p>
          </div>
          <MockButton primary>Buy</MockButton>
        </div>
      </Figure>

      <Sub>Offering a ball</Sub>
      <Steps
        items={[
          <>Open the <b>LearnHoops Ball + Full Analysis</b> offer.</>,
          <>Set your <b>Club price</b>.</>,
          <>Set a flat <b>Shipping</b> fee. The default is <b>$0</b>. Either build shipping into the price or set a fee.</>,
          <>Click <b>Save</b>, then turn it <b>On</b>.</>,
          <>LearnHoops ships the ball to the family. At checkout the buyer picks a size (<b>5</b>, <b>6</b> or <b>7</b>), their shooting hand, and enters a shipping address.</>,
        ]}
      />

      <Sub>Offering the Shooting Class</Sub>
      <P>This is your club&apos;s own class. You run it: schedule, gym, coaches. LearnHoops collects the registration payment from the results page.</P>
      <Steps
        items={[
          <>Open the <b>Shooting Class</b> offer.</>,
          <>Set the <b>Club price</b> (and a <b>Regular price</b> to show crossed out).</>,
          <>Under <b>Team join link</b>, pick the team a class player should join. The buyer&apos;s receipt includes that team&apos;s join link.</>,
          <>Set <b>After purchase, unlock</b> to <b>All this player&apos;s reports</b>, so class players stay unlocked every week.</>,
          <>Click <b>Save</b>, then turn it <b>On</b>.</>,
        ]}
      />

      <Sub>Bundles</Sub>
      <Steps
        items={[
          <>Use the pre-made <b>Shooting Class + Ball</b> offer, or click <b>Add offer</b> to create your own.</>,
          <>Tick more than one box under <b>Includes</b>.</>,
          <>Price it below the two items sold separately.</>,
          <>Click <b>Save</b>, then turn it <b>On</b>.</>,
        ]}
      />
      <Callout kind="important">
        For anything that includes the <b>Shooting Class</b> or the <b>LearnHoops ball</b>, set <b>After purchase, unlock</b> to <b>All this player&apos;s reports</b>. A family who paid for a class should never hit a paywall on next week&apos;s shot.
      </Callout>
      <Callout kind="tip">
        Do not need an offer? Click <b>Delete</b> on its card. You can always click <b>Add offer</b> later.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Payments, sales & your earnings
// ─────────────────────────────────────────────────────────────────────────────
export function Payments() {
  return (
    <Section
      id="payments"
      what="Shows you every sale, who bought what, what your club is owed, and how payouts and refunds work."
    >
      <Sub>How a family buys</Sub>
      <Steps
        items={[
          <>The family opens the private link from their results email.</>,
          <>Below the score they see your offer cards with prices and a <b>Buy</b> button.</>,
          <>They click <b>Buy</b> and pay by card.</>,
          <>The report unlocks within seconds. A ball buyer also picks a size and shooting hand and enters a shipping address.</>,
          <>You get an email for every sale.</>,
        ]}
      />
      <Callout kind="important">
        Purchases are <b>web-only</b>. A family cannot buy inside the iOS app. The link in the results email always opens the website, so this is only a concern if a family asks.
      </Callout>

      <Sub>See who paid</Sub>
      <Steps
        items={[
          <>Open the <b>Offers &amp; Sales</b> tab and click <b>Sales &amp; earnings</b> at the top.</>,
          <>The totals show <b>Sales</b>, <b>You get</b>, <b>LearnHoops keeps</b>, <b>Paid to you</b> and <b>Still owed</b>. CAD and USD are shown separately.</>,
          <>The table lists every sale: <b>Date · Buyer · Offer · Paid · Your share · Status</b>.</>,
          <>Use the filter chips to narrow it: <b>All</b>, <b>Class registrations</b>, <b>Ball orders</b>, <b>Breakdown unlocks</b>.</>,
        ]}
      />
      <Figure caption="The Sales & earnings section.">
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[
            ['Sales', '$1,196'],
            ['You get', '$897'],
            ['LearnHoops keeps', '$299'],
            ['Still owed', '$297'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white border border-gray-200 px-2 py-1.5 text-center">
              <p className="text-[9px] font-black uppercase tracking-wide text-gray-400">{k}</p>
              <p className="text-sm font-black font-numeric text-black">{v}</p>
              <p className="text-[9px] text-gray-400">CAD</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mb-2">
          <Chip tone="orange">All</Chip>
          <Chip>Class registrations</Chip>
          <Chip>Ball orders</Chip>
          <Chip>Breakdown unlocks</Chip>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 divide-y divide-gray-100">
          <div className="grid grid-cols-6 gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-gray-400">
            <span>Date</span><span>Buyer</span><span>Offer</span><span>Paid</span><span>Your share</span><span>Status</span>
          </div>
          <div className="grid grid-cols-6 gap-2 px-3 py-1.5 items-center">
            <span className="text-gray-600">Sep 3</span>
            <span className="font-bold text-black truncate">ava.parent@…</span>
            <span className="text-gray-700 truncate">Shooting Class</span>
            <span className="font-numeric text-black">$300</span>
            <span className="font-numeric text-black">$200</span>
            <span><Chip tone="green">Paid</Chip></span>
          </div>
        </div>
      </Figure>

      <Sub>Class registrations</Sub>
      <P>
        Filter by <b>Class registrations</b> to see exactly who paid for your class. You organize the class yourself: pick the dates,
        book the gym, run the sessions. Get each class player onto a roster with the team join link (their receipt already includes it) so
        their weekly shots land in the <b>Results</b> tab.
      </P>

      <Sub>Payouts</Sub>
      <P>
        LearnHoops collects all payments. Your share is paid to you manually, for example by e-transfer. The <b>Owed</b> total is what
        has not been paid out yet. Email <b>support@learnhoops.com</b> to arrange a payout or ask about one.
      </P>

      <Sub>Refunds</Sub>
      <P>
        Contact <b>support@learnhoops.com</b> with the buyer&apos;s email and what they bought. A refund reduces your share of that sale proportionally.
      </P>

      <Sub>Resending results</Sub>
      <P>
        If a family cannot find their email, go to the <b>Results</b> tab and click <b>Resend</b> on their row. It sends the same private link again.
      </P>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. The Coach-Led Development Program
// ─────────────────────────────────────────────────────────────────────────────
export function CoachLedProgram() {
  return (
    <Section
      id="coach-led-program"
      what="Describes the separate, older program in the Coach-Led Program tab, so you do not mix it up with the Shooting Class you sell to families."
    >
      <P>
        The <b>Coach-Led Development Program</b> is a different product from the offers in section 9. Here <b>your club prepays</b>
        LearnHoops <b>$40 per player</b> for a 10-week package, and your coach runs the sessions from a ready-made curriculum.
        Families do not buy anything from a results page. The <b>Shooting Class</b> offer, by contrast, is your own class that
        families pay for directly.
      </P>
      <Steps
        items={[
          <>Open the <b>Coach-Led Program</b> tab.</>,
          <>Buy a package: choose how many players and pay by card ($40 per player).</>,
          <>Enroll players from your rosters into the package.</>,
          <>Open the printable curriculum. It is a week-by-week coach sheet for all ten sessions.</>,
          <>Your coach films each player once in Week 1 and once in Week 10.</>,
          <>At the end, each player gets a completion certificate that compares the two shots.</>,
        ]}
      />
      <Callout kind="tip">
        Not sure which one you want? If <b>the club pays</b> and a coach delivers a set curriculum, that is the <b>Coach-Led Development Program</b>.
        If <b>families pay</b> to register for a class you design, that is the <b>Shooting Class</b> offer in <b>Offers &amp; Sales</b>.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Editing an evaluation (coach notes)
// ─────────────────────────────────────────────────────────────────────────────
export function EditingEvaluation() {
  return (
    <Section
      id="editing-evaluation"
      what="Lets a coach or org admin add their own suggested scores and notes to a report. The AI score itself never changes."
    >
      <Steps
        items={[
          <>Open any player&apos;s report (section 5).</>,
          <>As a coach or org admin you see a <b>Coach view</b> bar at the top.</>,
          <>Under any of the 18 checks, click <b>Your score &amp; note (coach)</b>.</>,
          <>Enter your suggested score and a short note. Players see this next to the AI score.</>,
          <>To leave a general comment, click <b>Add your own note</b>. Choose <b>public</b> (the player sees it) or <b>private</b> (only coaches and admins see it).</>,
          <>Click <b>See the player&apos;s view</b> to check exactly what the player will read.</>,
        ]}
      />
      <Figure caption="Under one check: the AI score and the coach's suggested score side by side.">
        <div className="rounded-lg bg-white border border-gray-200 p-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="font-black text-black">Elbow under the ball</p>
            <span className="font-numeric font-black text-black">6 / 10</span>
          </div>
          <p className="text-gray-600 mb-2">The elbow flares out at the set point, pushing the ball off line.</p>
          <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wide text-orange-700">Your score &amp; note (coach)</p>
            <p className="text-gray-800"><b className="font-numeric">7</b> &mdash; Better than last week. Keep the elbow tucked on the way up.</p>
          </div>
        </div>
      </Figure>
      <Callout kind="important">
        You cannot change the AI&apos;s number. Your score sits beside it, labelled as the coach&apos;s. If you think the AI is wrong, check the filming angle first (section 4), then add a note explaining what you saw.
      </Callout>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Organization settings
// ─────────────────────────────────────────────────────────────────────────────
export function OrgSettings() {
  return (
    <Section id="org-settings" what="Covers renaming your club, billing and plan changes, and appearance.">
      <Sub>Rename your organization</Sub>
      <Steps
        items={[
          <>On the <b>Organization dashboard</b>, click your organization&apos;s name in the header.</>,
          <>Type the new name and save.</>,
        ]}
      />
      <Sub>Billing and plan</Sub>
      <Steps
        items={[
          <>Open the <b>Settings</b> tab, expand <b>Billing</b>, and click <b>Manage billing</b>. This opens the secure Stripe billing portal, where you can update your card and download invoices. (Organizations on a free or grandfathered plan won&apos;t see this card — there is nothing to bill.)</>,
          <>Plan changes (<b>Basic</b> to <b>Plus</b> or back) are made on the dashboard as well.</>,
        ]}
      />
      <Sub>Appearance</Sub>
      <Steps
        items={[
          <>Open the <b>Settings</b> tab.</>,
          <>Choose <b>light</b> or <b>dark</b>.</>,
        ]}
      />
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Troubleshooting
// ─────────────────────────────────────────────────────────────────────────────
const TROUBLE: Array<{ problem: ReactNode; fix: ReactNode }> = [
  {
    problem: 'A player says they got no email.',
    fix: (
      <>
        Check their status chip in the <b>Results</b> tab. <b>No email — share join link</b>: send them the join link so they create an account.
        <b> Unsubscribed</b>: they opted out; tell them in person. <b>Bounced</b>: the email address on their account must be fixed.
        Otherwise ask them to check their spam folder, then click <b>Resend</b>.
      </>
    ),
  },
  {
    problem: 'The chip still says Not sent after I sent.',
    fix: (
      <>
        Refresh the page and check the chip again. If you sent many at once, look for the rate-limit message: about 20 sends per hour per organization. Wait an hour and send the rest.
      </>
    ),
  },
  {
    problem: 'A video will not upload.',
    fix: (
      <>
        Make sure it is one shot per clip, under a few minutes long, in a common phone video format, and filmed in good light. Try again on Wi-Fi.
      </>
    ),
  },
  {
    problem: 'A score seems wrong.',
    fix: (
      <>
        Check the filming angle first: from the front, whole body in frame, not from across the gym. See <b>learnhoops.com/support#filming</b>.
        Add a coach note on the report with your own suggested score (section 12).
      </>
    ),
  },
  {
    problem: 'I cannot turn an offer On.',
    fix: (
      <>
        Selling needs an active organization plan. Check the status bar in the <b>Offers &amp; Sales</b> tab: if it says <b>Selling needs an active plan</b>, renew from the plan section on the dashboard or fix your card under <b>Settings → Billing</b>; if it says <b>Selling paused</b>, contact support@learnhoops.com.
      </>
    ),
  },
  {
    problem: 'A family paid but the report is still locked.',
    fix: (
      <>
        Ask them to wait 30 seconds and refresh the page. If it is still locked, email <b>support@learnhoops.com</b> with the buyer&apos;s email address.
      </>
    ),
  },
  {
    problem: 'A player is on the roster but has no email.',
    fix: (
      <>
        They were added name-only from an upload. Send the family the team join link (<b>learnhoops.com/signup?teamCode=XXXXXX</b>). Once they create an account, results can be emailed.
      </>
    ),
  },
  {
    problem: 'I want to change how much families see for free.',
    fix: (
      <>
        <b>Offers &amp; Sales</b> tab, click <b>What players see</b> at the top, change <b>Free with the email</b>, click <b>Save</b>. Then <b>Resend</b> to anyone already sent, which refreshes their free level.
      </>
    ),
  },
  {
    problem: 'Questions about a payout or a refund.',
    fix: <>Email <b>support@learnhoops.com</b>. Include your organization name and, for refunds, the buyer&apos;s email.</>,
  },
]

export function Troubleshooting() {
  return (
    <Section id="troubleshooting" what="Lists the problems clubs run into most, and the one thing to do about each.">
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wide text-gray-400 text-left bg-gray-50">
              <th className="py-2 px-3 w-[38%]">Problem</th>
              <th className="py-2 px-3">What to do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {TROUBLE.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="py-2.5 px-3 font-bold text-black">{r.problem}</td>
                <td className="py-2.5 px-3 text-gray-600 leading-relaxed">{r.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="trouble">
        Still stuck? Email <b>support@learnhoops.com</b> or use the form at <b>learnhoops.com/support</b>. Say which tab you were on and what you clicked.
      </Callout>
    </Section>
  )
}
