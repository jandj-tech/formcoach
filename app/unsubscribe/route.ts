// Every email we send links to /unsubscribe?email=...&sig=..., and the same URL
// is the List-Unsubscribe header. The handler lives in app/api/unsubscribe; it
// is served here too so those links work.
//
// This stays a route handler, not a page, because POST matters as much as GET:
// Gmail and Yahoo POST here when a reader uses their built-in unsubscribe, and
// the confirm page's button posts here. GET only redirects to
// /unsubscribe/confirm and never changes anything.
export { GET, POST } from '@/app/api/unsubscribe/route'
