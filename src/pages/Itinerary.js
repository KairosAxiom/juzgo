import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import PlacePicker from '../components/PlacePicker';
import ItineraryMap from '../components/ItineraryMap';
import RegionCards from '../components/RegionCards';
import { DAY_COLORS } from '../constants/dayColors';
import { deriveRegions, orderRegions, interRegionConnector } from '../lib/regions';
import { partitionByLocation, clusterPlacesByProximity, allocateDays, orderOutGroups, boundsCentroid, describeOutOfDest } from '../lib/partition';
import styles from './Itinerary.module.css';
import {
  fetchDestinationBounds, stripOutOfBoundsCoords, stripTransitNetworkPlaces,
  geocodeCustomAdds, ensureMustSeePlaces, partitionAndClusterByDay,
  sequencePlaces, applyDayArchetypeSwaps, buildTravelSegments,
  parsePlacesJSON, parseEnrichmentJSON,
} from '../lib/itineraryEngine';

const CATEGORIES = [
  { id: 'food',      emoji: '🍜', title: 'Food & Dining',        desc: 'Restaurants, cafes, street food' },
  { id: 'shopping',  emoji: '🏬', title: 'Shopping Malls',       desc: 'Major malls and retail centres' },
  { id: 'specialty', emoji: '🛍️', title: 'Specialty Shops',      desc: 'Local markets, boutiques, artisan shops' },
  { id: 'places',    emoji: '🏛️', title: 'Places of Interest',   desc: 'Landmarks, museums, heritage sites' },
  { id: 'nature',    emoji: '🌿', title: 'Nature & Parks',       desc: 'Parks, gardens, scenic spots' },
  { id: 'culture',   emoji: '🎭', title: 'Culture & Arts',       desc: 'Galleries, theatres, cultural centres' },
  { id: 'nightlife', emoji: '🌙', title: 'Nightlife',            desc: 'Bars, clubs, night markets' },
  { id: 'wellness',  emoji: '💆', title: 'Wellness & Spas',      desc: 'Spas, massage, wellness centres' },
  { id: 'sports',    emoji: '🏄', title: 'Sports & Activities',  desc: 'Adventure, sports venues' },
  { id: 'transport', emoji: '🚇', title: 'Getting Around',       desc: 'Key transport tips and hubs' },
];

const UNIQUE_CATS = [
  { id: 'gems',      emoji: '💎', title: 'Hidden Local Gems',    desc: 'Spots the guidebooks miss' },
  { id: 'seasonal',  emoji: '🎏', title: 'Seasonal & Events',    desc: "What's on while you're there" },
  { id: 'foodcrawl', emoji: '🥢', title: 'Local Food Crawls',    desc: 'Curated tastings, market to table' },
];

const PROXY_URL = 'https://claude-proxy.kairosventure-io.workers.dev/';

/* Lightweight markdown renderer for chat bubbles — headers, bold, rules, blockquotes, lists */
function renderMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let listBuffer = [];

  function flushList() {
    if (listBuffer.length > 0) {
      blocks.push(<ul key={`list-${blocks.length}`} className="md-list">{listBuffer}</ul>);
      listBuffer = [];
    }
  }

  function renderInline(str, key) {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>
    );
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed === '') {
      flushList();
      return; // collapse blank lines instead of stacking <br>
    }
    if (/^---+$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={idx} className="md-rule" />);
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(<h3 key={idx} className="md-h3">{renderInline(trimmed.slice(3), idx)}</h3>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push(<h2 key={idx} className="md-h2">{renderInline(trimmed.slice(2), idx)}</h2>);
      return;
    }
    if (trimmed.startsWith('> ')) {
      flushList();
      blocks.push(<blockquote key={idx} className="md-quote">{renderInline(trimmed.slice(2), idx)}</blockquote>);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      listBuffer.push(<li key={idx}>{renderInline(trimmed.replace(/^[-*]\s+/, ''), idx)}</li>);
      return;
    }
    flushList();
    blocks.push(<p key={idx} className="md-p">{renderInline(trimmed, idx)}</p>);
  });

  flushList();
  return blocks;
}

export default function Itinerary() {
  const [step, setStep] = useState(1); // 1=details, 2=interests, 3=place picker, 4=itinerary+map
  const [destination, setDestination] = useState('');
  const [dates, setDates] = useState({ from: '', to: '' });
  const [arrivalTime, setArrivalTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [noAccommodation, setNoAccommodation] = useState(false);
  const [travelers, setTravelers] = useState(1);
  const [budget, setBudget] = useState('moderate');
  const [perDayCount, setPerDayCount] = useState(3);
  const [interests, setInterests] = useState(['food', 'places']);
  const [mustSee, setMustSee] = useState('');
  const [experience, setExperience] = useState('');

  const [recommendedPlaces, setRecommendedPlaces] = useState([]);
  const [finalPlaces, setFinalPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');

  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [planDirty, setPlanDirty] = useState(false); // true after a place is moved but before the written plan is regenerated
  const [planGenerated, setPlanGenerated] = useState(false); // false until the user confirms edits and generates the written plan
  const [messages, setMessages] = useState([]);

  // ── Region-card view (Session 29) — its OWN state slice; finalPlaces is
  // untouched so save/restore/map are unaffected. `enrichment` holds the
  // per-region eat/stay/getting-here + per-place price data from the
  // confirm-time enrichment call (null until it runs; fail-open renders
  // cards without it). `enrichmentLoading` gates the loading label.
  // `regionView` toggles between the default map+day-list and the cards.
  const [enrichment, setEnrichment] = useState(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [regionView, setRegionView] = useState(false);

  // ── Region layout (Session 31) — the partitioned day-block structure
  // (destination block + out-of-town group blocks) computed by
  // partitionAndClusterByDay. Drives the Step-4 review UI (keep/drop +
  // day-block repositioning) and lets the cross-boundary move guard know which
  // block a stop belongs to. Recomputed whenever the chosen set changes.
  const [regionLayout, setRegionLayout] = useState([]);
  const [droppedGroups, setDroppedGroups] = useState(() => new Set());
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [user, setUser] = useState(null);
  const chatRef = useRef(null);
  const { lang } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const savedId = searchParams.get('saved');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (savedId && session?.user) loadSavedItinerary(savedId);
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  function toggleInterest(id) {
    setInterests((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function tripDayCount() {
    if (!dates.from || !dates.to) return 3;
    const d1 = new Date(dates.from);
    const d2 = new Date(dates.to);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 3;
  }

  /* ── Stage 2 → 3: fetch recommended places ── */
  async function handleFetchPlaces() {
    if (!destination.trim()) return;
    setPlacesError('');
    setPlacesLoading(true);
    setStep(3);

    const cats = interests.map((id) => [...CATEGORIES, ...UNIQUE_CATS].find((c) => c.id === id)?.title).filter(Boolean).join(', ');
    const dayCount = tripDayCount();
    // requestedCount is what the traveller asked for via "Activities per day";
    // targetCount deliberately overproduces (~40% more) so PlacePicker has
    // real optional suggestions to offer rather than exactly enough to fill
    // the requested pace and nothing more.
    const requestedCount = dayCount * perDayCount;
    // Overproduce modestly (~30%) for optional suggestions, but cap lower than
    // before: the richer per-place schema (whyVisit/bestTime/duration) makes
    // each object ~3x larger, so a high place count pushes the research
    // response long enough to risk truncation/timeout on content-heavy
    // destinations (e.g. Japan). 30 keeps the payload comfortably whole.
    const targetCount = Math.min(30, Math.max(10, Math.round(requestedCount * 1.3)));
    const mustSeeList = mustSee.split(',').map((s) => s.trim()).filter(Boolean);
    const accomLine = noAccommodation
      ? 'Accommodation not yet booked — feel free to suggest a well-located area to stay.'
      : accommodation ? `Staying at: ${accommodation}.` : '';
    const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime}.` : '';
    const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime}.` : '';
    const mustSeeLine = mustSeeList.length
      ? `The traveller has specifically asked to include these places — you MUST include every one of them in the JSON output, with accurate real coordinates, "source":"user_specified" and "tier":"core": ${mustSeeList.join(', ')}.`
      : '';
    const experienceText = experience.trim();
    const experienceLine = experienceText
      ? `In the traveller's own words, here's the kind of trip they want — treat this as strong steering for WHICH specific places you pick and which you leave out (favour places that fit it, skip ones that clash), on top of the interest categories above: "${experienceText}".`
      : '';

    const prompt = `Recommend exactly ${targetCount} specific real places for a ${dayCount}-day trip to ${destination}, matching: ${cats || 'general sightseeing'}. The traveller plans roughly ${requestedCount} activities total at their selected pace — return more than that as bonus options (see tier rule below).
${arrivalLine}
${departureLine}
${accomLine}
${experienceLine}
${mustSeeLine}

Respond with ONLY a valid JSON array, no markdown fences, no prose. Keep every field tight — the whole array must fit in one response, so brevity matters. Each object:
{"id":"slug","name":"Place name","type":"category","description":"max 15 words","whyVisit":"max 20 words on what makes it worth a stop","bestTime":"max 6 words, e.g. 'Early morning, before crowds'","duration":"a range, e.g. '1–2 hours'","trust":"michelin|unesco|tourism|tripadvisor|gem|ai","lat":number,"lng":number,"tier":"core|optional","dateUncertain":boolean}

Stay within those word caps. "whyVisit", "bestTime", and "duration" are the richer detail a traveller reads before deciding — keep each concise and specific to THIS place (no generic filler like "a must-see for everyone"). "duration" is a rough guide only; never phrase it as an instruction.

Use real, accurate coordinates for each place — this matters more than usual, since we group places into days by their coordinates afterward, not by anything you decide. "michelin" only for actual Michelin recognition, "unesco" only for actual World Heritage sites, "tourism" for official board picks, "tripadvisor" for known traveller favorites, "gem" for genuine local spots, "ai" as fallback. Favor a spatially varied set across ${destination} over clustering everything in one neighborhood, so the whole trip has enough ground to work with once we group it geographically.

Mark roughly the first ${requestedCount} places as "tier":"core" (matching what the traveller asked for) and the rest as "tier":"optional" — bonus suggestions they can choose to add or skip. Across the full set, include at least ${dayCount * 3} genuine food/dining places and at least ${dayCount * 2} points of interest beyond food, so every day has real choice once places are grouped geographically — do not limit yourself to exactly the requested pace only.

Do not include a place whose subject is a transit network, station-as-generic-concept, or mode of transport itself (e.g. "MRT Network", "City Bus System", "The Subway") — these are not destinations. If "Getting Around" is one of the traveller's interests, leave it out of this JSON array entirely; it's handled separately as travel tips, not a place card.

Set "dateUncertain": true for any seasonal or limited-run event/exhibit you are not fully confident falls within the traveller's exact trip dates; otherwise omit it or set it false. Never assert a specific date you're not confident about.`;

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = parsePlacesJSON(text);
      if (parsed.length === 0) throw new Error('No places returned');

      // Backfill tier/source for anything Claude omitted, so downstream
      // code can always rely on these fields being present.
      const normalized = parsed.map((p, i) => ({
        ...p,
        source: p.source || 'ai',
        tier: p.tier || (i < requestedCount ? 'core' : 'optional'),
      }));
      // Code-level backstop for the "MRT as a place" problem — the prompt
      // already asks Claude to omit these, this just catches it if not.
      const noTransitPlaces = stripTransitNetworkPlaces(normalized);

      // Catch coordinate hallucinations against the destination's real
      // borders before they can drag a cluster across a country (see
      // fetchDestinationBounds / stripOutOfBoundsCoords).
      const bounds = await fetchDestinationBounds(destination);
      const sanitized = stripOutOfBoundsCoords(noTransitPlaces, bounds);

      // Guarantee every traveller-named place survives, even if Claude
      // dropped it — force-add with a fallback geocode if genuinely missing.
      const withMustSee = await ensureMustSeePlaces(sanitized, mustSeeList, destination);

      // Day assignment is computed here, from the coordinates Claude returned —
      // not trusted from anything Claude said about "day". Session 31: partition
      // out-of-destination places (e.g. Kyoto/Nara/Fuji added to a Tokyo trip)
      // into their own day-blocks so no day mixes regions — see
      // partitionAndClusterByDay.
      const { places: clustered, layout } = partitionAndClusterByDay(withMustSee, dayCount, bounds, destination);
      window.__lastBounds = bounds;
      console.log('[Juzgo debug] Parsed places:', parsed);
      console.log('[Juzgo debug] Destination bounds:', bounds);
      console.log('[Juzgo debug] Region layout:', layout.map((b) => ({ key: b.key, kind: b.kind, days: `${b.dayStart}-${b.dayEnd}`, n: b.places.length })));
      console.log('[Juzgo debug] Clustered by day:', clustered);
      window.__lastPlaces = clustered;
      setRecommendedPlaces(clustered);
      setRegionLayout(layout);
    } catch (err) {
      setPlacesError('We had trouble researching places for this destination. Please try again.');
    }
    setPlacesLoading(false);
  }

  function parsePlacesJSON(text) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    // Fast path: well-formed array.
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to salvage */ }

    // Salvage path: the response may be truncated (array never closed) if the
    // model ran long. Rather than fail the whole trip, pull out every complete
    // top-level object and keep them — a partial list beats an error screen.
    const start = cleaned.indexOf('[');
    if (start === -1) return [];
    const body = cleaned.slice(start + 1);
    const objects = [];
    let depth = 0, inStr = false, esc = false, buf = '';
    for (const ch of body) {
      if (esc) { buf += ch; esc = false; continue; }
      if (ch === '\\') { buf += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; buf += ch; continue; }
      if (inStr) { buf += ch; continue; }
      if (ch === '{') { if (depth === 0) buf = ''; depth++; buf += ch; continue; }
      if (ch === '}') {
        depth--;
        buf += ch;
        if (depth === 0) {
          try { objects.push(JSON.parse(buf)); } catch { /* skip malformed */ }
          buf = '';
        }
        continue;
      }
      if (depth > 0) buf += ch;
    }
    return objects;
  }

  /* ── Stage 3 → 4: build itinerary from chosen places ── */
  async function handleBuildItinerary(chosenPlaces) {
    const dayCount = tripDayCount();

    // "Add your own" places from PlacePicker arrive with null coordinates.
    // Geocode them now (sequential, fail-open) so a distant one (e.g. Nara
    // added here rather than as must-see) has real coordinates — and so it's
    // partitioned into the correct region-block below, not wedged into a
    // destination day. See geocodeCustomAdds.
    const geocoded = await geocodeCustomAdds(chosenPlaces, destination);

    // Session 31: re-partition the FINAL chosen set (research picks + custom
    // adds) so every day is region-pure — this is what closes the "far place
    // added in PlacePicker lands in a Tokyo day" gap, since partitioning runs
    // on all chosen places, not just must-see. bounds is fetched once here
    // (fail-open: null bounds ⇒ single destination block, original behaviour).
    const bounds = await fetchDestinationBounds(destination);
    window.__lastBounds = bounds;
    let { places: partitioned, layout } = partitionAndClusterByDay(geocoded, dayCount, bounds, destination);

    // Honour any out-of-town groups the traveller dropped in the review: remove
    // their places entirely and re-partition so the freed days return to the
    // destination (D6). Dropped-group keys are matched against the layout.
    if (droppedGroups.size > 0) {
      const droppedPlaceIds = new Set();
      layout.forEach((b) => { if (b.kind === 'out' && droppedGroups.has(b.key)) b.places.forEach((p) => droppedPlaceIds.add(p.id)); });
      if (droppedPlaceIds.size > 0) {
        const kept = geocoded.filter((p) => !droppedPlaceIds.has(p.id));
        ({ places: partitioned, layout } = partitionAndClusterByDay(kept, dayCount, bounds, destination));
      }
    }

    // Archetype swaps (arrival/departure easing) apply WITHIN the destination
    // block only — never move a far stop onto a destination day or vice-versa.
    const destDays = layout.find((b) => b.kind === 'dest');
    const destDayEnd = destDays ? destDays.dayEnd : dayCount;
    const destPart = partitioned.filter((p) => p.regionKey === 'dest');
    const outPart = partitioned.filter((p) => p.regionKey !== 'dest');
    const destAdjusted = applyDayArchetypeSwaps(destPart, destDayEnd);

    // Sequence within every day (both blocks); regionKey + day are preserved.
    const orderedPlaces = sequencePlaces([...destAdjusted, ...outPart], dayCount);

    setFinalPlaces(orderedPlaces);
    setRegionLayout(layout);
    console.log('[Juzgo debug] Final places sent to map:', orderedPlaces);
    console.log('[Juzgo debug] Region layout:', layout.map((b) => ({ key: b.key, kind: b.kind, days: `${b.dayStart}-${b.dayEnd}`, n: b.places.length })));
    window.__finalPlaces = orderedPlaces;
    setStep(4);
    setPlanDirty(false);
    setPlanGenerated(false);
    setMessages([]);
    // Note: the written itinerary is NOT generated here. The traveller lands
    // on the map + editable day list first, arranges days as they like, and
    // only then clicks "Confirm & generate" (confirmAndGenerate) to build the
    // prose. This avoids spending a Claude call on an arrangement they're
    // about to change.
  }

  /*
   * Enrichment call (Session 29) — a SEPARATE, confirm-time Claude call that
   * produces the extra detail the region cards show: a per-region "where to
   * eat" and "where to stay" line, an optional hedged "getting here" note,
   * and a per-place price ONLY for well-known fixed-fee ticketed venues.
   *
   * Independent of the prose build (buildItineraryFromPlaces). Writes only
   * into the `enrichment` slice; finalPlaces is never mutated. FAIL-OPEN
   * throughout: any error, empty parse, or missing field leaves enrichment
   * as-is (or null) and the cards render from finalPlaces alone.
   *
   * PRICE GATING is the key safety mechanism: with no live web access, the
   * model must only surface a price when it's a genuinely well-known fixed
   * admission (park gate, cable car, scenic-area ticket, museum). Everything
   * else — restaurants, streets, viewpoints, free temples — must come back
   * isPaidAttraction:false, price:null. The prompt states this explicitly and
   * the renderer shows a price only when isPaidAttraction is true.
   */
  async function runEnrichment(placesForEnrichment) {
    const places = placesForEnrichment || [];
    if (places.length === 0) return;
    setEnrichmentLoading(true);
    try {
      const regions = orderRegions(deriveRegions(places));
      if (regions.length === 0) { setEnrichmentLoading(false); return; }

      // Compact per-region payload: name-hint (day range), its places, and the
      // ordered region list so the model can offer hedged inter-region hints.
      const regionBlocks = regions.map((r) => {
        const rp = places
          .filter((p) => r.days.includes(Number(p.day)))
          .map((p) => `    - id:${p.id} | ${p.name} (${p.type}, Day ${p.day})${p.whyVisit ? ` — ${p.whyVisit}` : ''}`)
          .join('\n');
        return `Region ${r.key} (Days ${r.days.join(', ')}):\n${rp}`;
      }).join('\n\n');

      const regionOrderLine = regions.map((r) => r.key).join(' → ');

      const prompt = `You are enriching a ${destination} travel itinerary that has already been organised into geographic regions. For EACH region below, provide local dining and lodging guidance and, where applicable, ticket prices — as STRICT JSON only.

Regions (in travel order: ${regionOrderLine}):

${regionBlocks}

Return ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{
  "regions": [
    {
      "key": "<the region key exactly as given, e.g. d1-3>",
      "name": "<a short human region name you infer, e.g. Central Tokyo or Mount Fuji>",
      "eat": ["<2-3 specific dishes or food spots to seek out in this region>"],
      "stay": "<one short line: the best area/neighbourhood to base yourself in this region>",
      "gettingHere": "<for regions AFTER the first: ONE hedged line on getting here from the previous region — general mode + rough duration only, phrased as guidance to verify. For the first region use null.>",
      "places": [
        { "id": "<place id exactly as given>", "isPaidAttraction": <true|false>, "price": "<e.g. ¥1000 / SGD 12, or null>" }
      ]
    }
  ]
}

CRITICAL rules:
- PRICE GATING: set isPaidAttraction:true and give a price ONLY when the place is a well-known, fixed-fee ticketed venue — a park gate, cable car, scenic-area ticket, or museum admission whose price is genuinely established. For restaurants, streets, markets, viewpoints, free temples/shrines, or anything whose fee you are not confident about, set isPaidAttraction:false and price:null. Never guess a price. When unsure, isPaidAttraction:false.
- gettingHere: NEVER name a specific train line, service, platform, or fare, and NEVER quote a schedule. Give only a general mode (train/bus/car) and a rough duration, phrased so the traveller knows to verify (e.g. "usually reached by train, about 2 hours — check current schedules"). Null for the first region.
- Include every place id given for a region in that region's "places" array.
- Output valid JSON only — no commentary, no code fences.`;

      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = parseEnrichmentJSON(text);
      if (parsed && Array.isArray(parsed.regions) && parsed.regions.length > 0) {
        // Index by region key for O(1) lookup in the renderer; also index the
        // per-place price by id for the same reason.
        const byRegion = {};
        const priceById = {};
        parsed.regions.forEach((rg) => {
          if (!rg || !rg.key) return;
          byRegion[rg.key] = {
            name: typeof rg.name === 'string' ? rg.name : null,
            eat: Array.isArray(rg.eat) ? rg.eat.filter((x) => typeof x === 'string') : [],
            stay: typeof rg.stay === 'string' ? rg.stay : null,
            gettingHere: typeof rg.gettingHere === 'string' ? rg.gettingHere : null,
          };
          if (Array.isArray(rg.places)) {
            rg.places.forEach((pl) => {
              if (pl && pl.id && pl.isPaidAttraction === true && typeof pl.price === 'string' && pl.price.toLowerCase() !== 'null') {
                priceById[pl.id] = pl.price;
              }
            });
          }
        });
        setEnrichment({ byRegion, priceById });
        console.log('[Juzgo debug] Enrichment:', { byRegion, priceById });
      } else {
        console.warn('[Juzgo debug] Enrichment returned no usable regions — cards will render without it.');
      }
    } catch (err) {
      console.warn('[Juzgo debug] Enrichment failed (fail-open):', err);
    }
    setEnrichmentLoading(false);
  }

  /* Defensive JSON parse for the enrichment response: strips fences, tries a
     straight parse, and on failure salvages the first balanced {...} object.
     Returns null rather than throwing — the caller fails open. */
  function parseEnrichmentJSON(text) {
    const cleaned = (text || '').replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* fall through to salvage */ }
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    let depth = 0, inStr = false, esc = false, buf = '';
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { buf += ch; esc = false; continue; }
      if (ch === '\\') { buf += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; buf += ch; continue; }
      if (inStr) { buf += ch; continue; }
      if (ch === '{') { depth++; buf += ch; continue; }
      if (ch === '}') {
        depth--; buf += ch;
        if (depth === 0) { try { return JSON.parse(buf); } catch { return null; } }
        continue;
      }
      if (depth > 0) buf += ch;
    }
    return null;
  }

  /* First-time generation, fired by the Confirm button once the traveller is
     happy with the day arrangement. Subsequent moves use the dirty/Regenerate
     flow instead. Enrichment runs first (fail-open), then the prose build. */
  async function confirmAndGenerate() {
    setPlanGenerated(true);
    setPlanDirty(false);
    await runEnrichment(finalPlaces);
    await buildItineraryFromPlaces(finalPlaces);
  }

  /* Which region block a given day belongs to, per the current layout — used to
     stop a per-stop move from crossing a region boundary (Session 31, D7). */
  function regionKeyForDay(day) {
    const block = regionLayout.find((b) => day >= b.dayStart && day <= b.dayEnd);
    return block ? block.key : 'dest';
  }

  /* Moves a single place onto a different day (from the Step-4 editor), then
     re-sequences every day geographically so the new day's stop order and
     travel times stay correct. Does NOT re-run archetype swaps — this is a
     deliberate user override, so we respect the day they chose. The written
     plan is left as-is and marked dirty; the user regenerates on demand.
     Session 31: a move is BLOCKED if it would cross a region boundary (e.g. a
     Kyoto stop onto a Tokyo day) — that would re-create the mixed-region days
     this whole partition exists to prevent. Whole out-of-town day-blocks are
     repositioned via moveRegionBlock instead. */
  function movePlaceToDay(placeId, newDay) {
    const targetDay = Number(newDay);
    const place = finalPlaces.find((p) => p.id === placeId);
    if (place && regionLayout.length > 0) {
      const fromKey = place.regionKey || regionKeyForDay(Number(place.day));
      const toKey = regionKeyForDay(targetDay);
      if (fromKey !== toKey) {
        window.alert("That stop belongs to a different part of your trip. To rearrange out-of-town days, move the whole day using its ↕ control — individual stops can't cross between areas.");
        return;
      }
    }
    setFinalPlaces((prev) => {
      const moved = prev.map((p) => (p.id === placeId ? { ...p, day: targetDay } : p));
      const resequenced = sequencePlaces(moved, tripDayCount());
      window.__finalPlaces = resequenced;
      return resequenced;
    });
    setPlanDirty(true);
  }

  /* Repositions a whole out-of-town day-block to start at a new day (Session 31,
     D7). Moves every stop in the block together, shifts the intervening days to
     make room, and keeps all blocks contiguous — so the region-pure structure
     is preserved. Destination block can't be moved (it's the anchor). */
  function moveRegionBlock(blockKey, newStartDay) {
    setRegionLayout((prevLayout) => {
      const block = prevLayout.find((b) => b.key === blockKey);
      if (!block || block.kind !== 'out') return prevLayout;
      const span = block.dayEnd - block.dayStart + 1;
      const total = tripDayCount();
      const start = Math.max(1, Math.min(Number(newStartDay), total - span + 1));
      if (start === block.dayStart) return prevLayout;

      // Rebuild day numbers: pull the block out, then reinsert its span at the
      // new start, renumbering everything else around it while preserving each
      // block's internal order.
      const others = prevLayout.filter((b) => b.key !== blockKey)
        .sort((a, b) => a.dayStart - b.dayStart);
      // Sequence of blocks in new order by desired start position.
      const rebuilt = [];
      let cursor = 1;
      const insertBlock = (b) => {
        const s = b.dayEnd - b.dayStart + 1;
        rebuilt.push({ ...b, dayStart: cursor, dayEnd: cursor + s - 1 });
        cursor += s;
      };
      let inserted = false;
      for (const b of others) {
        if (!inserted && cursor >= start) { insertBlock(block); inserted = true; }
        insertBlock(b);
      }
      if (!inserted) insertBlock(block);

      // Apply the new day numbers to finalPlaces via each block's place ids.
      const dayByPlaceId = {};
      rebuilt.forEach((b) => {
        // Map each place's OLD relative day within its block to the new range.
        const oldStart = prevLayout.find((x) => x.key === b.key).dayStart;
        b.places.forEach((p) => {
          const rel = Number(p.day) - oldStart; // 0-based day offset within block
          dayByPlaceId[p.id] = b.dayStart + rel;
        });
      });
      setFinalPlaces((prev) => {
        const moved = prev.map((p) => (dayByPlaceId[p.id] != null ? { ...p, day: dayByPlaceId[p.id] } : p));
        const resequenced = sequencePlaces(moved, tripDayCount());
        window.__finalPlaces = resequenced;
        return resequenced;
      });
      setPlanDirty(true);
      return rebuilt;
    });
  }

  /* Drops an out-of-town group from the review: its places are removed and the
     freed days return to the destination (Session 31, D6). Re-runs the build
     from the current finalPlaces minus the dropped block's places. */
  function dropRegionBlock(blockKey) {
    const block = regionLayout.find((b) => b.key === blockKey);
    if (!block || block.kind !== 'out') return;
    setDroppedGroups((prev) => new Set(prev).add(blockKey));
    const dropIds = new Set(block.places.map((p) => p.id));
    const kept = finalPlaces.filter((p) => !dropIds.has(p.id));
    const bounds = window.__lastBounds || null;
    const { places: repartitioned, layout } = partitionAndClusterByDay(kept, tripDayCount(), bounds, destination);
    setFinalPlaces(repartitioned);
    setRegionLayout(layout);
    window.__finalPlaces = repartitioned;
    setPlanDirty(true);
  }

  /* Rebuilds the written itinerary AND re-runs enrichment (so the region
     cards reflect the moved stops) from the current finalPlaces order after
     the traveller has shuffled days around. Gated behind an explicit confirm
     so a stray click doesn't spend two Claude calls; enrichment re-runs only
     here, not on every individual move. */
  async function regenerateItinerary() {
    const proceed = window.confirm('Finished moving stops — regenerate the plan and cards now?');
    if (!proceed) return;
    setPlanDirty(false);
    setItineraryLoading(true);
    await runEnrichment(finalPlaces);
    await buildItineraryFromPlaces(finalPlaces);
  }

  /* Shared itinerary-prose builder used by both the initial build and the
     "Regenerate plan" button. Takes an already-sequenced places array,
     computes fresh travel segments from it, prompts Claude, and writes the
     result into messages. */
  async function buildItineraryFromPlaces(orderedPlaces) {
    const dayCount = tripDayCount();
    const travelSegments = buildTravelSegments(orderedPlaces);
    console.log('[Juzgo debug] Travel segments:', travelSegments);
    setItineraryLoading(true);

    const placesList = orderedPlaces.map((p) => {
      const dateNote = p.dateUncertain ? ' — date not confirmed, describe generally rather than asserting an exact date' : '';
      const sourceNote = p.source === 'user_specified' ? ' — traveller specifically requested this place' : '';
      return `- ${p.name} (${p.type}, Day ${p.day})${dateNote}${sourceNote}`;
    }).join('\n');

    const segmentLines = travelSegments.length
      ? travelSegments.map((s) =>
          s.mode === 'walk'
            ? `Day ${s.day}: "${s.from}" → "${s.to}": ${s.mins} min walk`
            : `Day ${s.day}: "${s.from}" → "${s.to}": ~${s.taxiMins} min by taxi/rideshare, or ~${s.transitMins} min by public transit (MRT/bus, includes station access, waiting, and any transfers)`
        ).join('\n')
      : '(No coordinate-based segments available — use your judgement sparingly and keep timing vague, e.g. "a short trip".)';
    const accomLine = noAccommodation
      ? 'Accommodation is not yet booked — suggest a well-located area to stay and factor in flexible timing for Day 1.'
      : accommodation ? `Staying at: ${accommodation}. Factor travel time to/from this location into the schedule.` : '';
    const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime} — Day 1 should start realistically after arrival, factoring in immigration, baggage, and transit to accommodation.` : '';
    const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime} — the final day should end with enough buffer time to reach the airport/departure point.` : '';
    const dayArchetypeLine = dayCount >= 2
      ? `Day 1 is the arrival day — keep the tone and any supplementary tips low-key, easing the traveller in. Day ${dayCount} is the departure day — assume standard hotel checkout around 11:00–12:00 and that the traveller is carrying or has stored their luggage until they leave for the airport; keep tips for this day calm and logistics-aware, and do not suggest or add any strenuous, muddy, or far-flung outdoor activity for it even in passing.`
      : '';
    const experienceText = experience.trim();
    const experienceToneLine = experienceText
      ? `The traveller described the trip they want in their own words: "${experienceText}". Keep the tone, framing, and any tips aligned with this — but do NOT add places beyond the list above to satisfy it.`
      : '';

    const prompt = `You are a travel guide creating a detailed day-by-day itinerary for ${destination}.
Trip length: ${dayCount} days (${dates.from || 'flexible'} to ${dates.to || 'flexible'}). Travelers: ${travelers}. Budget: ${budget}.
${arrivalLine}
${departureLine}
${accomLine}
${experienceToneLine}
${dayArchetypeLine}

Build the itinerary using ONLY these places, in this exact order within each day — they've already been sequenced geographically to minimize backtracking, so do not reorder them:
${placesList}

Pre-calculated travel times between consecutive same-day stops (these come from real coordinates — use these exact numbers, do not estimate your own):
${segmentLines}

Format with clear day headings (e.g. "## Day 1"), morning/afternoon/evening structure, and a short "Before You Go" tips section at the top. Keep it well-organized and practical. Do not invent additional must-see places beyond the list above, but you may add brief transport tips between stops.

IMPORTANT phrasing rule for timing: do NOT suggest how long the traveller should spend at each location — let them decide that for themselves. Only mention timing when referring to travel time between consecutive stops, using ONLY the pre-calculated numbers given above:
- If a segment is a walk, phrase it as "🚶 Travel time to next stop: ~X mins (walk)".
- If a segment gives both a taxi and a transit number, phrase it as something like "🚕 ~X mins by taxi, or 🚇 ~Y mins by public transit (MRT/bus)" — you may mention that a public bus is a realistic alternative to the MRT when it plausibly serves that route, but do not invent a different number for it; always use the given transit number.
- If a transition isn't listed above, write "Travel time to next stop: plan for local transit" instead of guessing a number.
Never write a bare "Allow X mins" or suggest a dwell duration at a location.`;

    setMessages([{ role: 'assistant', content: `Building your ${destination} itinerary…` }]);

    try {
      // Long trips (e.g. 7+ days) can exceed a single response's token ceiling,
      // truncating the plan partway through (the "only 4 of 7 days shown" bug).
      // So we auto-continue: if the model stops because it hit max_tokens, we
      // send the plan-so-far back and ask it to keep going from where it left
      // off, appending each chunk. Hard-capped at a few rounds so it can never
      // loop indefinitely. The visible message grows with each chunk.
      const MAX_CONTINUATIONS = 4;
      let accumulated = '';
      // Conversation history for the continue-loop: the original build request,
      // then alternating assistant chunks / "continue" nudges.
      const history = [{ role: 'user', content: prompt }];
      let finished = false;

      for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
        const res = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: history }),
        });
        const data = await res.json();
        const chunk = data.content?.[0]?.text || '';
        if (!chunk && accumulated === '') {
          throw new Error('empty response');
        }
        accumulated += chunk;
        // Show progress as it builds.
        setMessages([{ role: 'assistant', content: accumulated }]);

        // stop_reason "max_tokens" means the model was cut off mid-plan; any
        // other value (end_turn, stop_sequence) means it finished naturally.
        // Fallback: some proxy configurations don't surface stop_reason, so if
        // it's absent we infer truncation from the chunk being large (near the
        // token ceiling) and not ending on a natural closing line.
        const explicitlyTruncated = data.stop_reason === 'max_tokens';
        const stopReasonMissing = data.stop_reason == null;
        const looksTruncated =
          stopReasonMissing &&
          chunk.length > 6000 && // ~4096 tokens ≈ well over 6k chars of dense prose
          !/[.!?*"')\]]\s*$/.test(chunk.trimEnd()); // doesn't end on natural punctuation
        if (!explicitlyTruncated && !looksTruncated) { finished = true; break; }

        // Truncated — feed the plan-so-far back and ask it to continue exactly
        // where it stopped, without repeating or re-introducing.
        history.push({ role: 'assistant', content: accumulated });
        history.push({
          role: 'user',
          content: 'Continue the itinerary exactly where you left off — do not repeat any day or heading already written, do not add a preamble, just carry straight on from the next stop through the final day. Keep the same formatting and the same travel-time phrasing rules.',
        });
      }

      if (!accumulated) {
        setMessages([{ role: 'assistant', content: "Sorry, I couldn't generate your itinerary. Please try again." }]);
      } else if (!finished) {
        // Ran out of continuation rounds — extremely long trip. Keep what we
        // have (it's most of the plan) rather than discarding it.
        console.warn('[Juzgo debug] Itinerary hit continuation cap — plan may be slightly incomplete on a very long trip.');
      }
    } catch {
      setMessages([{ role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    }
    setItineraryLoading(false);
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);
    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: history }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || 'Sorry, something went wrong.';
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setChatLoading(false);
  }

  const PENDING_KEY = 'juzgo_pending_itinerary';

  /* ── Load a saved itinerary by ID ── */
  async function loadSavedItinerary(id) {
    const { data, error } = await supabase
      .from('saved_itineraries')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return;
    setDestination(data.destination || '');
    setFinalPlaces(data.selected_places || []);
    setMessages([{ role: 'assistant', content: data.trip_data || '' }]);
    setPlanGenerated(true);
    setPlanDirty(false);
    setStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Update an existing saved itinerary ── */
  async function updateSavedItinerary() {
    if (!savedId) { saveItinerary(); return; }
    const itinText = messages.find((m) => m.role === 'assistant' && m.content.length > 100)?.content || '';
    const { error } = await supabase
      .from('saved_itineraries')
      .update({ trip_data: itinText, selected_places: finalPlaces, updated_at: new Date() })
      .eq('id', savedId);
    if (error) { alert(`Update failed: ${error.message}`); return; }
    alert('Itinerary updated!');
  }

  /* ── Share itinerary ── */
  async function shareItinerary() {
    const url = savedId
      ? `${window.location.origin}/itinerary?saved=${savedId}`
      : window.location.href;
    const title = `${destination} Itinerary — Juzgo`;
    const text = `Check out my ${destination} itinerary planned with Juzgo!`;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  }

  async function saveItinerary() {
    const itinText = messages.find((m) => m.role === 'assistant' && m.content.length > 100)?.content || '';
    if (!user) {
      // Persist everything needed to resume after login/register
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        destination, content: itinText, step, finalPlaces, dates, travelers, budget,
      }));
      navigate('/login?redirect=itinerary');
      return;
    }
    const { error: saveErr } = await supabase.from('saved_itineraries').insert({ user_id: user.id, destination, trip_data: itinText, selected_places: finalPlaces, created_at: new Date() });
    if (saveErr) { alert(`Save failed: ${saveErr.message}`); return; }
    sessionStorage.removeItem(PENDING_KEY);
    alert('Itinerary saved!');
  }

  // Restore a pending itinerary (e.g. after returning from login/register) and auto-save once authenticated
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (!pending) return;
    try {
      const data = JSON.parse(pending);
      setDestination(data.destination || '');
      setFinalPlaces(data.finalPlaces || []);
      setDates(data.dates || { from: '', to: '' });
      setTravelers(data.travelers || 1);
      setBudget(data.budget || 'moderate');
      setMessages([{ role: 'assistant', content: data.content || '' }]);
      setPlanGenerated(true);
      setStep(4);
      // Auto-save now that the user is logged in
      supabase.from('saved_itineraries').insert({
        user_id: user.id, destination: data.destination, trip_data: data.content, selected_places: [], created_at: new Date(),
      }).then(() => {
        sessionStorage.removeItem(PENDING_KEY);
        alert('Welcome back! Your itinerary has been saved.');
      });
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
    }
  }, [user]);

  function resetAll() {
    setStep(1);
    setMessages([]);
    setPlanGenerated(false);
    setPlanDirty(false);
    setDestination('');
    setMustSee('');
    setExperience('');
    setRecommendedPlaces([]);
    setFinalPlaces([]);
    setEnrichment(null);
    setEnrichmentLoading(false);
    setRegionView(false);
    setRegionLayout([]);
    setDroppedGroups(new Set());
  }

  /* Toggle between the default map+day-list and the region cards. Enrichment
     is not persisted (save stores only prose + selected_places), so a saved
     or restored trip arrives with enrichment === null. The FIRST time the
     card view is opened we lazily run enrichment; fail-open leaves the cards
     rendering from finalPlaces alone. Fresh (just-confirmed) trips already
     have enrichment from confirmAndGenerate, so this no-ops for them. */
  function toggleRegionView() {
    setRegionView((prev) => {
      const next = !prev;
      if (next && !enrichment && !enrichmentLoading && finalPlaces.length > 0) {
        runEnrichment(finalPlaces);
      }
      return next;
    });
  }

  const dayCount = tripDayCount();
  const dayNumbers = Array.from({ length: dayCount }, (_, i) => i + 1);

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        {/* ── Step 1: Trip details ── */}
        {step === 1 && (
          <div className={styles.stepWrap}>
            <div className={styles.eyebrow}>AI itinerary</div>
            <h1 className={styles.h1}>Plan My Itinerary</h1>
            <p className={styles.sub}>AI-powered travel plans — verified places, real addresses, optimised routes.</p>

            <div className={styles.formGrid}>
              <div className={styles.formCard}>
                <label className={styles.label}>Where are you going?</label>
                <input
                  type="text"
                  placeholder="e.g. Tokyo, Japan"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.hint}>
                  <span className={styles.hintLink} onClick={() => navigate('/plans')}>💬 Need data while you're there? Browse eSIM plans →</span>
                </p>

                <label className={styles.label}>Any must-see places already on your list? (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mandai Wildlife Reserve, Jurong Bird Park"
                  value={mustSee}
                  onChange={(e) => setMustSee(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.hint}>Separate multiple places with commas — we'll make sure these are included.</p>

                <label className={styles.label}>What kind of trip do you want? (optional)</label>
                <textarea
                  placeholder={`Tell us in your own words — e.g. "mostly hiking and hot springs, quiet local food, skip the big tourist crowds"`}
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className={styles.textarea}
                  rows={3}
                />
                <p className={styles.hint}>We'll use this to choose places that fit the experience you're after.</p>

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Arrival date</label>
                    <input type="date" value={dates.from} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Arrival time</label>
                    <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className={styles.input} />
                  </div>
                </div>

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Departure date</label>
                    <input type="date" value={dates.to} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Departure time</label>
                    <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className={styles.input} />
                  </div>
                </div>

                <label className={styles.label}>Where are you staying?</label>
                <input
                  type="text"
                  placeholder="e.g. Marina Bay Sands, or a neighbourhood"
                  value={accommodation}
                  onChange={(e) => setAccommodation(e.target.value)}
                  className={styles.input}
                  disabled={noAccommodation}
                />
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={noAccommodation}
                    onChange={(e) => { setNoAccommodation(e.target.checked); if (e.target.checked) setAccommodation(''); }}
                    className={styles.checkboxInput}
                  />
                  <span>Nothing booked yet — suggest a good area to stay</span>
                </label>

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Travellers</label>
                    <input type="number" min="1" max="20" value={travelers} onChange={(e) => setTravelers(e.target.value)} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Budget</label>
                    <select value={budget} onChange={(e) => setBudget(e.target.value)} className={styles.select}>
                      <option value="budget">Budget</option>
                      <option value="moderate">Moderate</option>
                      <option value="comfort">Comfortable</option>
                      <option value="luxury">Luxury</option>
                    </select>
                  </div>
                </div>

                <label className={styles.label}>Activities per day</label>
                <select value={perDayCount} onChange={(e) => setPerDayCount(parseInt(e.target.value, 10))} className={styles.select}>
                  <option value={2}>Relaxed — 2 per day</option>
                  <option value={3}>Balanced — 3 per day</option>
                  <option value={4}>Packed — 4 per day</option>
                  <option value={5}>Action-packed — 5 per day</option>
                </select>
                <p className={styles.hint} style={{ marginBottom: 18 }}>This helps us research the right number of places and pace your schedule realistically.</p>

                <button
                  className={styles.btnNext}
                  onClick={() => setStep(2)}
                  disabled={!destination.trim()}
                >
                  Personalise my trip →
                </button>
              </div>

              <div className={styles.featurePanel}>
                <h2 className={styles.featureH2}>A trip that<br /><em className={styles.featureEm}>plans itself.</em></h2>
                <ul className={styles.featureList}>
                  <li className={styles.featureItem}><span className={styles.check}>✓</span>Verified places and real addresses — never an AI hallucination.</li>
                  <li className={styles.featureItem}><span className={styles.check}>✓</span>Routes optimised so you spend less time in transit, more time exploring.</li>
                  <li className={styles.featureItem}><span className={styles.check}>✓</span>A day-by-day plan tuned to your pace, budget and interests.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Interests ── */}
        {step === 2 && (
          <div className={styles.stepWrap}>
            <button className={styles.btnBack} onClick={() => setStep(1)}>← Back</button>
            <div className={styles.eyebrow} style={{ marginTop: 20 }}>Personalise</div>
            <h1 className={styles.h1}>What do you love?</h1>
            <p className={styles.sub}>Select your interests and we'll research places that match.</p>

            <div className={styles.catSection}>
              <div className={styles.catHeading}>Experiences</div>
              <div className={styles.catGrid}>
                {CATEGORIES.map((c) => {
                  const active = interests.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`${styles.catCard} ${active ? styles.catCardActive : ''}`}
                      onClick={() => toggleInterest(c.id)}
                    >
                      <div className={`${styles.catCheckbox} ${active ? styles.catCheckboxActive : ''}`}>{active ? '✓' : ''}</div>
                      <span className={styles.catEmoji}>{c.emoji}</span>
                      <div>
                        <div className={styles.catTitle}>{c.title}</div>
                        <div className={styles.catDesc}>{c.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.catSection}>
              <div className={styles.catHeading}>Unique to Juzgo</div>
              <div className={styles.catGrid}>
                {UNIQUE_CATS.map((c) => {
                  const active = interests.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`${styles.catCard} ${active ? styles.catCardActive : ''}`}
                      onClick={() => toggleInterest(c.id)}
                    >
                      <div className={`${styles.catCheckbox} ${active ? styles.catCheckboxActive : ''}`}>{active ? '✓' : ''}</div>
                      <span className={styles.catEmoji}>{c.emoji}</span>
                      <div>
                        <div className={styles.catTitle}>{c.title}</div>
                        <div className={styles.catDesc}>{c.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button className={styles.btnGenerate} onClick={handleFetchPlaces}>
              Research places to visit →
            </button>
          </div>
        )}

        {/* ── Step 3: Place picker ── */}
        {step === 3 && (
          <>
            {placesLoading ? (
              <div className={styles.placesLoadingWrap}>
                <div className={styles.spinnerBig} />
                <p className={styles.loadingText}>Researching the best places in {destination}…</p>
              </div>
            ) : placesError ? (
              <div className={styles.errorWrap}>
                <p className={styles.errorText}>{placesError}</p>
                <button className={styles.btnGenerate} onClick={handleFetchPlaces}>Try again</button>
              </div>
            ) : (
              <PlacePicker
                destination={destination}
                places={recommendedPlaces}
                onConfirm={handleBuildItinerary}
                onBack={() => setStep(2)}
                loading={itineraryLoading}
              />
            )}
          </>
        )}

        {/* ── Step 4: Itinerary + Map ── */}
        {step === 4 && (
          <div className={styles.chatWrap}>
            <div className={styles.chatHeader}>
              <div>
                <div className={styles.eyebrow}>Your itinerary</div>
                <h1 className={styles.chatH1}>{destination}</h1>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryItem}>📅 {dayCount} days</span>
                  <span className={styles.summaryItem}>👥 {travelers} traveller{travelers > 1 ? 's' : ''}</span>
                  <span className={styles.summaryItem}>💰 {budget}</span>
                  <span className={styles.summaryItem}>📍 {finalPlaces.length} places</span>
                </div>
              </div>
              <div className={styles.chatActions}>
                {planGenerated && (
                  <button className={styles.btnSave} onClick={savedId ? updateSavedItinerary : saveItinerary}>
                    {savedId ? 'Update' : 'Save itinerary'}
                  </button>
                )}
                <button className={styles.btnRestart} onClick={resetAll}>New trip</button>
              </div>
            </div>

            {/* ── View toggle: map + day list  vs.  region cards ──
                 Only offered once the plan is generated (region cards show
                 enrichment that's only fetched at confirm-time). */}
            {planGenerated && finalPlaces.length > 0 && (
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewToggleBtn} ${!regionView ? styles.viewToggleActive : ''}`}
                  onClick={() => setRegionView(false)}
                >
                  🗺 Map &amp; days
                </button>
                <button
                  className={`${styles.viewToggleBtn} ${regionView ? styles.viewToggleActive : ''}`}
                  onClick={() => { if (!regionView) toggleRegionView(); }}
                >
                  🧭 By region
                </button>
              </div>
            )}

            {/* ── Region-card view ── */}
            {planGenerated && regionView && finalPlaces.length > 0 && (
              <RegionCards
                regions={orderRegions(deriveRegions(finalPlaces))}
                places={finalPlaces}
                enrichment={enrichment}
                segments={buildTravelSegments(finalPlaces)}
                connectorFor={interRegionConnector}
                loading={enrichmentLoading}
              />
            )}

            {!regionView && finalPlaces.some((p) => p.lat && p.lng) && (
              <ItineraryMap places={finalPlaces} days={dayNumbers} />
            )}

            {/* ── Editable day-by-day stop list (reschedule) ── */}
            {!regionView && finalPlaces.length > 0 && (
              <div className={styles.editor}>
                <div className={styles.editorHead}>
                  <div>
                    <div className={styles.editorTitle}>Your stops by day</div>
                    <div className={styles.editorHint}>
                      {planGenerated
                        ? 'Move any place to a different day, then regenerate the written plan.'
                        : 'Arrange your stops across the days. When you\'re happy, confirm to generate your day-by-day itinerary.'}
                    </div>
                  </div>
                </div>

                {/* ── Region-block review (Session 31) ── */}
                {regionLayout.filter((b) => b.kind === 'out').length > 0 && (
                  <div className={styles.regionReview}>
                    <div className={styles.regionReviewHead}>
                      <span className={styles.regionReviewEyebrow}>Your trip splits into areas</span>
                      <p className={styles.regionReviewSub}>
                        Some of your places are outside {destination}, so they've been grouped into their own days. Keep them, drop any you'd rather skip (those days return to {destination}), or move an out-of-town day to a different slot.
                      </p>
                    </div>
                    {regionLayout.map((b) => {
                      const isOut = b.kind === 'out';
                      const dayRange = b.dayStart === b.dayEnd ? `Day ${b.dayStart}` : `Days ${b.dayStart}–${b.dayEnd}`;
                      const framing = isOut ? describeOutOfDest(b.framingKm, destination) : null;
                      const label = isOut
                        ? b.places.map((p) => p.name).slice(0, 3).join(', ') + (b.places.length > 3 ? '…' : '')
                        : destination;
                      return (
                        <div key={b.key} className={`${styles.regionBlock} ${isOut ? styles.regionBlockOut : ''}`}>
                          <div className={styles.regionBlockMain}>
                            <div className={styles.regionBlockTop}>
                              <span className={styles.regionBlockRange}>{dayRange}</span>
                              {isOut && (
                                <span className={`${styles.regionBlockTag} ${framing.kind === 'side-trip' ? styles.regionBlockTagFar : ''}`}>
                                  {framing.kind === 'side-trip' ? 'Side-trip' : 'Day-trip'}
                                </span>
                              )}
                            </div>
                            <div className={styles.regionBlockLabel}>{isOut ? label : `${destination} (main)`}</div>
                            {isOut && <div className={styles.regionBlockDesc}>{framing.text}</div>}
                          </div>
                          {isOut && !planGenerated && (
                            <div className={styles.regionBlockActions}>
                              <label className={styles.regionMoveWrap}>
                                <span className={styles.regionMoveLabel}>Start on</span>
                                <select
                                  className={styles.moveSelect}
                                  value={b.dayStart}
                                  onChange={(e) => moveRegionBlock(b.key, e.target.value)}
                                >
                                  {dayNumbers.map((d) => (
                                    <option key={d} value={d}>Day {d}</option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                className={styles.regionDropBtn}
                                onClick={() => dropRegionBlock(b.key)}
                              >
                                Drop
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!planGenerated && (
                  <div className={styles.confirmBar}>
                    <button
                      className={styles.btnConfirmPlan}
                      onClick={confirmAndGenerate}
                      disabled={itineraryLoading}
                    >
                      {itineraryLoading ? 'Generating your itinerary…' : '✓ Confirm & generate itinerary'}
                    </button>
                  </div>
                )}

                {planGenerated && planDirty && (
                  <div className={styles.dirtyBanner}>
                    <span className={styles.dirtyText}>You've moved a stop — the written plan below is out of date.</span>
                    <button
                      className={styles.btnRegen}
                      onClick={regenerateItinerary}
                      disabled={itineraryLoading}
                    >
                      {itineraryLoading ? 'Regenerating…' : '↻ Regenerate plan'}
                    </button>
                  </div>
                )}

                {dayNumbers.map((day) => {
                  const dayStops = finalPlaces.filter((p) => Number(p.day) === day);
                  return (
                    <div key={day} className={styles.editorDay}>
                      <div className={styles.editorDayLabel}>
                        <span className={styles.editorDayDot} style={{ background: DAY_COLORS[(day - 1) % DAY_COLORS.length] }} />
                        Day {day}
                        <span className={styles.editorDayCount}>{dayStops.length} {dayStops.length === 1 ? 'stop' : 'stops'}</span>
                      </div>
                      {dayStops.length === 0 ? (
                        <div className={styles.editorEmpty}>No stops yet — move one here.</div>
                      ) : (
                        dayStops.map((p) => (
                          <div key={p.id} className={styles.editorStop}>
                            <span className={styles.editorStopName}>{p.name}</span>
                            <label className={styles.moveWrap}>
                              <span className={styles.moveLabel}>Move to</span>
                              <select
                                className={styles.moveSelect}
                                value={day}
                                onChange={(e) => movePlaceToDay(p.id, e.target.value)}
                              >
                                {dayNumbers.map((d) => (
                                  <option key={d} value={d}>Day {d}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {planGenerated && (
              <>
                <div className={styles.chat} ref={chatRef}>
                  {messages.map((m, i) => (
                    <div key={i} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : styles.msgBot}`}>
                      <div className={styles.msgBubble}>
                        {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                      </div>
                    </div>
                  ))}
                  {itineraryLoading && (
                    <div className={`${styles.msg} ${styles.msgBot}`}>
                      <div className={styles.msgBubble}>
                        <div className={styles.typingDots}><span /><span /><span /></div>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleChat} className={styles.chatForm}>
                  <input
                    type="text"
                    placeholder="Ask a follow-up question…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className={styles.chatInput}
                    disabled={chatLoading}
                  />
                  <button type="submit" className={styles.chatSend} disabled={chatLoading || !input.trim()}>
                    Send →
                  </button>
                </form>

                {/* Bottom action bar — decision point after reviewing the itinerary */}
                <div className={styles.bottomActions}>
                  <p className={styles.bottomPrompt}>Happy with this plan?</p>
                  <div className={styles.bottomBtnRow}>
                    <button className={styles.btnSaveBig} onClick={savedId ? updateSavedItinerary : saveItinerary}>
                      {savedId ? '💾 Update itinerary' : '💾 Save itinerary'}
                    </button>
                    <button className={styles.btnShareBig} onClick={shareItinerary}>🔗 Share</button>
                    <button className={styles.btnPrintBig} onClick={() => window.print()}>🖨️ Print</button>
                    <button className={styles.btnReplanBig} onClick={() => setStep(3)}>↺ Re-plan places</button>
                    <button className={styles.btnRestartBig} onClick={resetAll}>+ New trip</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
