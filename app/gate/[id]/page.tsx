import { getRegion } from '@/lib/geo'
import GateContentWrapper from './GateContent'

export default async function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const region = await getRegion()
  return <GateContentWrapper id={id} region={region} />
}
