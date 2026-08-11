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

---

# Session 29 — Multi-Region Support + Region-Card View (August 11, 2026)

## A region-card view sits alongside the map, not replacing it
Decision: add an alternate "By region" view (RegionCards) toggled against the existing
map + editable day list, rather than replacing the map or bolting region grouping onto
it. Rationale: the map answers "where are my stops"; the card view answers "what are the
distinct areas of this trip and what do I do/eat/where do I stay in each". Different
questions, both worth keeping. The toggle only appears once the plan is generated,
because the cards surface enrichment that's only fetched at confirm-time.

## Multi-region is reached via must-see / add-your-own + geocoding, not a new place field
Decision: support a distant day-trip (Fuji, Nara on a Tokyo trip) by geocoding the
places the traveller explicitly adds, then deriving regions from coordinates — NOT by
adding a "region" field to the place schema or asking Claude to group. Rationale:
finalPlaces stays the single source of truth with its shape untouched (save/restore/map
unaffected), and the existing day-clustering already produces a geographic day path, so
regions fall out of per-day centroid distances with no schema change.

## User-named places are exempt from the destination-box coordinate strip
Decision: `stripOutOfBoundsCoords` still nulls out-of-box coordinates for AI-returned
places (its whole purpose — catching coord hallucinations), but places the traveller
explicitly named (`source==='user_specified'` or `isCustom`) are exempt from the tight
box and kept if within a generous ~4° country-scale sanity margin. Rationale: a real
add like Nara (~370km from Tokyo) is not a hallucination and must survive to form its
own region; but a garbage geocode (wrong continent) should still be caught. This trusts
explicit human input while preserving the guard for model output. It is a PARTIAL answer
to the Nominatim single-place limitation: it fixes user-named outliers, not multi-area
destination *strings*.

## PlacePicker stays presentational; geocoding of custom adds lives in Itinerary.js
Decision: geocode "add your own" places in `handleBuildItinerary` (after onConfirm,
before day assignment), reusing the existing `geocodePlace()` — rather than adding a
Nominatim call inside PlacePicker. Rationale: PlacePicker is a pure presentational
component (takes places, emits selection, no network); keeping it that way avoids
duplicating loading/error/fail-open logic and keeps all coordinate-sanitisation in one
place next to `ensureMustSeePlaces`/`stripOutOfBoundsCoords`. Cost is a brief geocoding
delay at confirm-time, bounded (a handful of adds) and fail-open, under an existing
loading state. Net effect: PlacePicker needed NO changes this session.

## Region derivation is a consecutive-day centroid walk with a fixed km threshold
Decision: derive regions by walking day numbers in order and starting a new region when
the next day's centroid jumps more than THRESHOLD_KM (=25) from the running region
centroid, rather than a fresh clustering pass. Rationale: `clusterPlacesByDay` already
orders days as a nearest-neighbour geographic path, so consecutive days are adjacent and
a simple ordered walk finds the real gaps. 25km cleanly separates cities (usually far
more than 25km apart) from intra-city hops (well under). It's a documented v1 heuristic,
tunable; a "cluster within region" pass is the noted fix if a lopsided day straddles a
boundary.

## Region order is main-first, then nearest-neighbour from the main region
Decision: the main region (most days → most places → earliest first day, deterministic)
leads; remaining regions follow as a nearest-neighbour path from the main centroid.
Rationale: the traveller's base city should anchor the view, and day-trips read most
naturally closest-first. Deterministic tie-breaks avoid a flickering order across
re-renders.

## Inter-region transport is grounded distance + hedged mode, never a fabricated fare/line
Decision: between region cards, show straight-line km (haversine between centroids) + a
rough duration + a hedged mode hint ("usually reached by train or bus, ~Xh; check
current schedules"). Never a specific line name, platform, fare, or schedule.
`estimateTravelMinutes`' taxi framing breaks down past ~80km and the model has no live
schedule data, so anything specific would be fabricated. This continues the pipeline's
existing rule: grounded facts stated plainly, volatile specifics hedged. The enrichment
call MAY add a hedged one-liner under the same no-specifics instruction; fail-open to
distance/time only.

## Enrichment is a separate confirm-time call, price-gated, fail-open, lazy on restore
Decision: fetch region eat/stay/getting-here + per-place prices via a SEPARATE
`claude-sonnet-4-6` call at confirm-time (and on the explicit regenerate confirm), into
its own state slice — not folded into the prose-build call and not persisted. Rationale:
keeps finalPlaces' shape untouched (save/restore/map unaffected); a dedicated JSON-only
call is easy to salvage-parse and fail open on. Because it isn't saved, it re-runs
lazily the first time a saved trip's card view is opened.
- PRICE GATING is the key safety mechanism: with no live web access, a price is surfaced
  ONLY for a well-known fixed-fee ticketed venue (park gate, cable car, scenic-area
  ticket, museum); everything else comes back isPaidAttraction:false, price:null, and
  the renderer shows a price only when the flag is true. "When unsure, false" is stated
  in the prompt.
- Enrichment re-runs only on the explicit regenerate confirm (gated by window.confirm),
  never per stop-move, so a shuffle doesn't spend a Claude call each drag.

## DAY_COLORS hoisted to a shared constant
Decision: move the byte-identical DAY_COLORS palette out of Itinerary.js and
ItineraryMap.js into `src/constants/dayColors.js`, imported by both plus RegionCards.js.
Rationale: three consumers now need the same palette (map pins, day-list dots, region
day sub-sections); a single source of truth means they can't drift. Proven
byte-identical pre/post so pins don't recolour.

## regions.js keeps its own haversineKm (deliberate duplication)
Decision: the pure region module carries its own small `haversineKm` rather than
importing the one in Itinerary.js. Rationale: keeps the module free of any React-page
import so it stays pure and Node-unit-testable. A 6-line pure function is an acceptable,
intentional duplication — flagged so it's not mistaken for accidental drift like the
DAY_COLORS case it sits next to.
