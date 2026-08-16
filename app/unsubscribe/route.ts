// Every email we send links to /unsubscribe?email=..., but the handler
// historically lived only at /api/unsubscribe — so the links 404ed. Serve
// the same handler here so those links (and List-Unsubscribe headers) work.
//
// POST matters as much as GET: this is the URL named in List-Unsubscribe, and
// Gmail and Yahoo POST to it when a reader uses their built-in unsubscribe.
export { GET, POST } from '@/app/api/unsubscribe/route'
