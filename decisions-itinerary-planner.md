# Decisions — AI Itinerary Planner (append to DECISIONS.md)

Design decisions locked during the Session 28.5 adjustment arc (July 28, 2026). All
frontend-only, in `src/pages/Itinerary.js` and `src/components/PlacePicker.js`.

## Place selection is fully opt-in — nothing pre-ticked
Earlier behaviour pre-selected "core" places (those matching the requested pace) and left
"optional" bonus suggestions unticked. Decision: start with NOTHING selected. The traveller
reads each place (aided by the per-card detail, below) and ticks individually or uses
"Select all". Rationale: the user explicitly wanted to go through the list and choose, not
notice-and-untick a default set. The core/optional distinction is retained only for section
grouping and prompt-balancing, never for default-checked state. Trade-off accepted: a user
who just wants the default plan must tap "Select all" — mitigated by keeping that control
prominent.

## Written itinerary is generated only after explicit Confirm, never on Step-4 entry
Previously the day-by-day prose auto-generated the moment the user reached Step 4. Decision:
Step 4 opens on the map + editable day list ONLY, behind a "✓ Confirm & generate itinerary"
button. Rationale: users rearrange days before they're happy; spending a Claude call on an
arrangement they're about to change is wasteful and produces a plan that's immediately stale.
A `planGenerated` flag gates the plan, chat, follow-up input, bottom action bar, and the Save
button — the last so a user can't save an empty plan. Saved/pending itineraries load with
`planGenerated=true` since they already carry prose.

## Rescheduling: dropdown "Move to Day", not drag-and-drop
Decision: each stop in the Step-4 editor has a "Move to Day ▾" dropdown, not a drag-and-drop
interface. Rationale: dropdowns are more reliable on mobile/touch, need no DnD library, and
are less error-prone. Moving a stop mutates `finalPlaces`, re-runs the existing geographic
`sequencePlaces` (so the target day re-orders sensibly and map pins recolour automatically),
but deliberately SKIPS `applyDayArchetypeSwaps` — a manual move is a user override and must be
respected, not second-guessed by the arrival/departure-day heuristics.

## Regeneration after a move is manual, not automatic
Decision (3a): after the plan exists, moving a stop marks it dirty (amber banner) and offers
a "↻ Regenerate plan" button — it does NOT auto-fire a Claude call on every move. Rationale:
auto-regeneration would fire a ~3000-token call per drag, slow and costly, and janky when a
user moves several stops in a row. The editable stop-list is the live source of truth; the
prose refreshes on demand. Both the initial build and the regenerate route through one shared
`buildItineraryFromPlaces()` so their prompts can't drift apart.

## Free-text "experience" input augments the interest checkboxes, never replaces them
Decision: a free-text "What kind of trip do you want?" box (Step 1) feeds the model alongside
the fixed interest categories — it does not replace them. Rationale: the checkboxes provide
structured signal that drives the prompt's balancing rules (≥ N food places, ≥ M points of
interest per day); free text alone can be vague ("something fun") and gives the model less to
anchor on. The experience text steers WHICH places are picked in the research call
(favour-fitting / skip-clashing) and the TONE of the written plan in the build call — but is
explicitly told it may NOT add places beyond the selected list, preserving the
"only these places" guarantee.

## Richer place detail is fetched up-front in the research call, not lazy-loaded per place
Decision: extend the Stage-3 research JSON with `whyVisit`, `bestTime`, `duration` for every
place in the single existing call, rather than firing a per-place detail call on demand.
Rationale: for a picker of ≤30 places, widening the one call is cheaper than N extra
round-trips, and the detail is instantly available on expand. Trade-off: bigger response
payload (see next decision).

## Research place count is capped at 30, with tight field caps and a truncation-salvage parser
Decision: cap the (overproduced) research place count at 30, enforce short word-limits on
every field in the prompt, and give `parsePlacesJSON` a salvage path. Rationale: the richer
schema roughly tripled each object's size; at the previous cap of 45, the research call ran
~78 seconds and truncated/timed out on content-heavy destinations (Japan, Korea) — the JSON
came back incomplete and failed to parse, producing the "trouble researching places" error.
Cutting places + tightening fields keeps the response whole and fast; the salvage parser
(brace-depth scanner, string-aware) recovers every complete object from a truncated array so a
partial list beats an error screen. NOTE: the ~78s worker time is a lingering fragility — a
durable fix is worker-side (raise/confirm timeout, or stream) BEFORE raising the place count
again.

## Destination bounds check stays on Nominatim, but its limits are now understood
No change to the mechanism, but two limits are documented as decisions-not-to-fix (yet):
(1) Nominatim is rate-limited; rapid retries can throttle it and surface as intermittent,
destination-looking failures — it fails open (skips the check) rather than blocking.
(2) It resolves best on a single named place; multi-area destinations ("Around Mount Fuji and
Tokyo") may yield a partial or over-wide box, weakening the coordinate-hallucination guard.
Decision: accept both for now; revisit only if multi-area trips become a promoted use case.

## Long multi-day plans use auto-continue, not a bigger single call or chunking
Decision: when the itinerary-build response is truncated by the token ceiling (a 7-day plan
at full write-up density exceeds one response), automatically send the plan-so-far back and
ask the model to continue from where it stopped, appending each chunk — rather than (a) simply
cranking max_tokens very high, or (b) generating the trip in fixed day-chunks. Rationale:
option (a) risks the same worker-timeout wall that plagued the research call (~78s), since one
enormous response takes proportionally longer; option (b) is more code and risks seams/repeats
at chunk boundaries. Auto-continue keeps each individual call within a safe 4096-token
response, grows the visible plan as it builds, and is hard-capped at 4 continuation rounds
(~16k tokens) so it can never loop indefinitely — and it keeps the partial plan if the cap is
hit rather than discarding. A fallback heuristic infers truncation from a long, unterminated
chunk in case the proxy doesn't surface `stop_reason`. NOTE the trade-off: a long trip now
makes 2+ sequential build calls on the slow worker; streaming is the durable follow-up.

## Root-cause discipline: the "only 4 of 7 days" bug was prose truncation, not day assignment
Worth recording because it was initially ambiguous. The symptom (7-day header, 4 days shown)
looked like it could be a day-clustering failure, but the map correctly showed all 7 days'
pins — proving day assignment was fine and the gap was purely in the written prose, cut off at
the build call's token ceiling. Lesson: when a count mismatch appears, check whether the
structured data (finalPlaces / map) has the full set before suspecting the assignment logic;
if it does, the fault is downstream in rendering or generation.
