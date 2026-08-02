// Every email we send links to /unsubscribe?email=..., but the handler
// historically lived only at /api/unsubscribe — so the links 404ed. Serve
// the same handler here so those links (and List-Unsubscribe headers) work.
export { GET } from '@/app/api/unsubscribe/route'
