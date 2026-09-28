# Rubric audit — where the instructions turn pixels into wrong numbers (2026-09-28)

Agent 4 (biomechanics logic auditor). Condensed; line numbers are lib/analyze.ts
unless stated. Full reasoning is in the session transcript.

## 0. Which text actually produced the misses
The Sep-28 arms (base3/tight3/base4/tight4) ran with RUBRIC_OVERRIDE unset, so
they graded on the LIVE DB text: STANCE v21, ELBOW v5, SQUARE v3, POWER v4.
cur.json (Sep 23) ran ELBOW v9 / KNEES v2 drafts via RUBRIC_OVERRIDE. The
229-cell big-miss table pooled both. Pattern is the same in each, but any edit
must target the text that is actually in the path, and the drafts are not
unless RUBRIC_OVERRIDE names them. SQUARE v3 is still live: deleting square.txt
removed a draft, not the DB rubric.

## 1. "Bad shot scored 9" is the designed behaviour on low-resolution input
1. :549 NEVER GUESS -> null;  :557 every other criterion MUST score. Contradictory; a number must be emitted.
2. :514 BURDEN OF PROOF: a deduction needs a describable flaw. At 10px there is none.
3. :561 forbids "hard to confirm / limited at this distance / cannot fully see"
   as deduction reasons and says CHANGE THE SCORE TO 10. This also silences the
   honest evidence self-report the counterweights depend on.
4. :525 MANDATORY 10 RULE + :597 "one small thing = 9". The model can always
   name one small thing -> 9 (E23: 34% of all scores on exactly 9).
5. Counterweights (:523 evidence "none" -> not full credit; :541 Square middle)
   fire only on a self-reported "none", which :561 punishes. Nothing consumes
   "partial". Dump: shot-198 Elbow ev=clear->9, shot-200 Elbow ev=clear->9.
6. :543 CONSISTENCY CHECK launders invented positive observations (E31).
7. Rubric tie-breaks: ELBOW v5 "when in doubt choose the milder tier"; POWER v4
   same; STANCE v21 "between one and two, call it correct"; v5 :414 sends an
   unconfident hoist read "back to the ordinary burden of proof".
Target line for Square defined FOUR ways: :474 and :537 say ball flight, never
facing; :567 says torso facing; SQUARE v3 STEP 1 says shoulders. Two of four
assume the answer. shot-208 (no basket in frame) -> "square to the target" -> 9.

## 2. Fault specificity
ELBOW v5: faults gated on fine detail (angle past 90, forearm folded past 45,
"both hands still grip"); ladder is 9-10 / 7-8.5 / 4-5 / 1-3 with NO 6 ->
bimodal output (9,9,9,9,8,5,5,4,4,4,4 vs expert 2-8.5).
SQUARE v3: 9-10 anchor is "feet down the shot line OR TURNED OFF IT ... shot
comes out clean" -> unfalsifiable; 5-6 anchor penalises the coached open stance.
POWER v4: leg fault = 4 words; everything else is ARM shape; 9-10 requires an
arm condition -> Power re-scores Elbow. Explains BOTH directions on shot-189.
STANCE v21: best fault language of the four; loses on the upward tie-break,
"there is no 8", and a 5-12px shoe ruler.

## 3. Catapult flag never fires
Conjunction of fine detail; exclusion needs a distinction the silhouette can't
make; confidence scale demands "a frame you can point to" (E32: model won't);
MEDIAN of passes discards the pass that saw it (base3 shot-196: true,false,false);
elbow_severely_out has no code-level criterion cap.

## 4. "Good shot scored 4-5"
Power double-charges the elbow (arm caps). Connected Shot has no rubric ->
general bands -> halo channel. Knees: legacy points-sum text (E18: 12 low/1
high). DomFoot: "even feet" is a deduction, and a front camera flattens the
stagger, so the null IS "even" -> every miss low.

## 6. Proposed edits (confidence in brackets)
6a [CONFIDENT] analyze.ts: delete :567; rewrite :561 to route visibility
   language to the evidence field instead of converting to 10; remove
   "milder tier" tie-breaks.
6b [structure CONFIDENT] Elbow ladder with a 6 rung, silhouette cues (elbow vs
   ball edge vs shoulder edge), one-hand finish as the 4-5 / 2-3 separator.
6c [SPECULATIVE cues, CONFIDENT no arm caps] Power = legs + timing only.
6d [SPECULATIVE] Square: fix the four-way contradiction, then MEASURE with the
   pairwise gate before writing more prose. r has been <= 0.07 in every version.
6e [CONFIDENT] Stance: symmetric tie-break, restore the 8 rung.
6f [CONFIDENT diagnosis] Catapult: silhouette cues, cue-COUNT confidence,
   max-of-passes for this flag (untested), cap only once the trigger is reliable.
   -> superseded in part by SETPOINT_CHECK (E45/E46a): single-frame detection.
6g [SPECULATIVE] Connected = timing cue; DomFoot = deduct only when the WRONG
   foot is visibly ahead.

Do NOT: crop (E25-27), disable reasoning (E4), observation categories (E37),
verification passes (E33/E41), symmetry (E34), label-distribution priming
(README rule 4), sub-pixel rulers, "partial -> mid-scale" (E34 in a coat).
Caveat: every proposal still asks for absolute placement (E39-E42).
