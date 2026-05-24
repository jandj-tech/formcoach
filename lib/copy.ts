// Copies text to the clipboard and surfaces a brief toast at the top of the
// page so the user gets visible confirmation. Returns the writeText promise
// so callers can also drive per-button "Copied!" feedback.
export function copyToClipboard(text: string, message = 'Link copied!'): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return Promise.resolve()
  }
  return navigator.clipboard.writeText(text).then(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('copy-toast', { detail: { message } }))
    }
  })
}
