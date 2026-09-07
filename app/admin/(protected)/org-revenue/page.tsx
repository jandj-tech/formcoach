import OrgRevenueClient from './OrgRevenueClient'

export default function OrgRevenuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-black dark:text-white">Org revenue</h1>
        <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">
          Organizations sell offers to families; LearnHoops collects the payment and pays each organization its
          share by hand. Every figure is per currency and is never combined across currencies.
        </p>
      </div>
      <OrgRevenueClient />
    </div>
  )
}
