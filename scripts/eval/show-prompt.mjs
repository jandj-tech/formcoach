// Prints the exact system prompt the grader sends, plus its prompt_sha.
// Diff it across branches to see what a change actually did to the prompt:
//   git stash && node … > /tmp/before.txt && git stash pop && node … > /tmp/after.txt
// Usage: npx tsx --env-file=.env.local scripts/eval/show-prompt.mjs [--sha-only]
const { renderGraderPrompt } = await import('../../lib/analyze.ts')
const { prompt, promptSha, rubricTags } = await renderGraderPrompt()
if (process.argv.includes('--sha-only')) {
  console.log(promptSha, '|', prompt.length, 'chars |', rubricTags.join(', '))
} else {
  console.error(`# prompt_sha ${promptSha}  (${prompt.length} chars)`)
  console.log(prompt)
}
process.exit(0)
