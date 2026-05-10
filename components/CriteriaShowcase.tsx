const FUNDAMENTALS = [
  { num: '01', title: 'Shooting Hand Grip', desc: 'Thumb spread wide. Ball rests on the finger pads, not the palm.' },
  { num: '02', title: 'Elbow Under the Ball', desc: 'A clean 90° L-shape with the forearm directly under the ball.' },
  { num: '03', title: 'Square to the Basket', desc: 'Hips, shoulders, and feet aligned toward the rim before you go up.' },
  { num: '04', title: 'Power From the Legs', desc: 'Knees bent. Power drives up through the core into the release.' },
  { num: '05', title: 'One-Hand Release', desc: 'Guide hand stays put. Ball rolls off the index and middle fingers.' },
  { num: '06', title: 'Follow Through', desc: 'Wrist snaps down. Fingers point at the rim. Hold the goose-neck.' },
]

export default function CriteriaShowcase() {
  return (
    <section className="px-4 py-12 sm:py-16 max-w-5xl mx-auto w-full">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
          <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">17 Coaching Criteria</span>
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-black leading-tight">
          The fundamentals of <span className="text-orange-500">a great shot</span>
        </h2>
        <p className="text-black text-base mt-4 max-w-xl leading-relaxed">
          Every shot you upload is scored against 17 criteria coaches use. Here are six of them.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FUNDAMENTALS.map((f) => (
          <div key={f.num} className="bg-gray-50 rounded-xl p-5 text-center border border-gray-200">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold text-sm flex items-center justify-center mx-auto mb-3">
              {f.num}
            </div>
            <h3 className="text-black font-semibold text-sm mb-1">{f.title}</h3>
            <p className="text-black text-xs leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
