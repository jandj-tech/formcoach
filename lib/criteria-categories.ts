// Groups the 18 grading criteria into coach-friendly categories for the
// "Score + category scores" visibility tier. Pure module, no DB imports.
//
// Criteria are matched by NAME, not id: ids are SERIAL and can differ between
// databases, while the names come from the one seed in scripts/migrate.sql and
// are stable. A criterion whose name is not in the map (a future addition)
// lands in the trailing "Other" bucket rather than disappearing from a rollup.

export const CRITERIA_CATEGORY_ORDER = [
  'Base & Balance',
  'Grip & Set',
  'Release',
  'Follow-Through',
  'Power & Flow',
] as const

export type CriteriaCategory = (typeof CRITERIA_CATEGORY_ORDER)[number] | 'Other'

const NAME_TO_CATEGORY: Record<string, CriteriaCategory> = {
  'Feet Shoulder Width Apart': 'Base & Balance',
  'Square to the Basket': 'Base & Balance',
  'Knees Bent': 'Base & Balance',
  'Dominant Foot Forward': 'Base & Balance',
  'Forward Motion and Toes': 'Base & Balance',
  'Thumb is Spread Wide': 'Grip & Set',
  'Guide Hand Placement': 'Grip & Set',
  'Palm Non-Contact with Ball': 'Grip & Set',
  'Elbow L-Shape — Under the Ball': 'Grip & Set',
  'Shot Pocket — Elbow': 'Grip & Set',
  'Shooting Through Guide Hand / One Hand Release': 'Release',
  'Two Finger Release': 'Release',
  'Ball Rotation': 'Release',
  'Shooting Hand Follow Through': 'Follow-Through',
  'Guide Hand Follow Through': 'Follow-Through',
  'Shot Arc': 'Follow-Through',
  'Source of Shot Power': 'Power & Flow',
  'Connected Shot': 'Power & Flow',
}

export function categoryForCriterion(name: string): CriteriaCategory {
  return NAME_TO_CATEGORY[name] ?? 'Other'
}

export interface CategoryScore {
  name: CriteriaCategory
  /** Average of the category's non-null criterion scores, one decimal. */
  score: number | null
  /** How many criteria in this category actually carried a score. */
  count: number
}

/**
 * Roll flat criterion scores up into category averages. Null scores (the
 * grader's deliberate "ungraded" state) are excluded from the average and the
 * count; a category with no scored criteria reports score null. Categories
 * come back in CRITERIA_CATEGORY_ORDER, "Other" last and only when non-empty.
 */
export function categoryScores(
  criterionScores: ReadonlyArray<{ name: string; score: number | null }>
): CategoryScore[] {
  const buckets = new Map<CriteriaCategory, { total: number; count: number }>()
  for (const c of criterionScores) {
    const cat = categoryForCriterion(c.name)
    const bucket = buckets.get(cat) ?? { total: 0, count: 0 }
    if (c.score !== null && Number.isFinite(c.score)) {
      bucket.total += c.score
      bucket.count += 1
    }
    buckets.set(cat, bucket)
  }
  const ordered: CriteriaCategory[] = [...CRITERIA_CATEGORY_ORDER]
  if (buckets.has('Other')) ordered.push('Other')
  return ordered
    .filter((name) => buckets.has(name))
    .map((name) => {
      const { total, count } = buckets.get(name)!
      return {
        name,
        score: count > 0 ? Math.round((total / count) * 10) / 10 : null,
        count,
      }
    })
}
