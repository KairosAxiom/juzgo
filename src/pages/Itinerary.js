import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import PlacePicker from '../components/PlacePicker';
import ItineraryMap from '../components/ItineraryMap';
import styles from './Itinerary.module.css';

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

  const [recommendedPlaces, setRecommendedPlaces] = useState([]);
  const [finalPlaces, setFinalPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');

  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [user, setUser] = useState(null);
  const chatRef = useRef(null);
  const { lang } = useLang();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
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
    const targetCount = Math.min(30, Math.max(6, dayCount * perDayCount));
    const accomLine = noAccommodation
      ? 'Accommodation not yet booked — feel free to suggest a well-located area to stay.'
      : accommodation ? `Staying at: ${accommodation}.` : '';
    const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime}.` : '';
    const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime}.` : '';

    const prompt = `Recommend exactly ${targetCount} specific real places for a ${dayCount}-day trip to ${destination}, matching: ${cats || 'general sightseeing'}. Traveller wants about ${perDayCount} activities per day.
${arrivalLine}
${departureLine}
${accomLine}

Respond with ONLY a valid JSON array, no markdown fences, no prose. Each object:
{"id":"slug","name":"Place name","type":"category","description":"max 20 words","trust":"michelin|unesco|tourism|tripadvisor|gem|ai","lat":number,"lng":number,"day":1-${dayCount}}

Use real accurate coordinates. "michelin" only for actual Michelin recognition, "unesco" only for actual World Heritage sites, "tourism" for official board picks, "tripadvisor" for known traveller favorites, "gem" for genuine local spots, "ai" as fallback. Distribute evenly across ${dayCount} days, about ${perDayCount} per day.`;

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = parsePlacesJSON(text);
      console.log('[Juzgo debug] Parsed places:', parsed);
      window.__lastPlaces = parsed;
      if (parsed.length === 0) throw new Error('No places returned');
      setRecommendedPlaces(parsed);
    } catch (err) {
      setPlacesError('We had trouble researching places for this destination. Please try again.');
    }
    setPlacesLoading(false);
  }

  function parsePlacesJSON(text) {
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { return []; }
      }
      return [];
    }
  }

  /* ── Stage 3 → 4: build itinerary from chosen places ── */
  async function handleBuildItinerary(chosenPlaces) {
    setFinalPlaces(chosenPlaces);
    console.log('[Juzgo debug] Final places sent to map:', chosenPlaces);
    window.__finalPlaces = chosenPlaces;
    setStep(4);
    setItineraryLoading(true);

    const dayCount = tripDayCount();
    const placesList = chosenPlaces.map((p) => `- ${p.name} (${p.type}, suggested Day ${p.day || '?'})`).join('\n');
    const accomLine = noAccommodation
      ? 'Accommodation is not yet booked — suggest a well-located area to stay and factor in flexible timing for Day 1.'
      : accommodation ? `Staying at: ${accommodation}. Factor travel time to/from this location into the schedule.` : '';
    const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime} — Day 1 should start realistically after arrival, factoring in immigration, baggage, and transit to accommodation.` : '';
    const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime} — the final day should end with enough buffer time to reach the airport/departure point.` : '';

    const prompt = `You are a travel guide creating a detailed day-by-day itinerary for ${destination}.
Trip length: ${dayCount} days (${dates.from || 'flexible'} to ${dates.to || 'flexible'}). Travelers: ${travelers}. Budget: ${budget}.
${arrivalLine}
${departureLine}
${accomLine}

Build the itinerary using ONLY these places, organizing them sensibly by day and time of day:
${placesList}

Format with clear day headings (e.g. "## Day 1"), morning/afternoon/evening structure, and a short "Before You Go" tips section at the top. Keep it well-organized and practical. Do not invent additional must-see places beyond the list above, but you may add brief transport or timing tips between stops.

IMPORTANT phrasing rule for timing: do NOT suggest how long the traveller should spend at each location — let them decide that for themselves. Only mention timing when referring to travel time between consecutive stops, phrased as "Travel time to next stop: ~X mins" (by the most sensible mode — walk, MRT, taxi, etc). Never write a bare "Allow X mins" or suggest a dwell duration at a location.`;

    setMessages([{ role: 'assistant', content: `Building your ${destination} itinerary…` }]);

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "Sorry, I couldn't generate your itinerary. Please try again.";
      setMessages([{ role: 'assistant', content: text }]);
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
    setDestination('');
    setRecommendedPlaces([]);
    setFinalPlaces([]);
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
                <button className={styles.btnSave} onClick={saveItinerary}>Save itinerary</button>
                <button className={styles.btnRestart} onClick={resetAll}>New trip</button>
              </div>
            </div>

            {finalPlaces.some((p) => p.lat && p.lng) && (
              <ItineraryMap places={finalPlaces} days={dayNumbers} />
            )}

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
                <button className={styles.btnSaveBig} onClick={saveItinerary}>💾 Save itinerary</button>
                <button className={styles.btnPrintBig} onClick={() => window.print()}>🖨️ Print</button>
                <button className={styles.btnReplanBig} onClick={() => setStep(3)}>↺ Re-plan places</button>
                <button className={styles.btnRestartBig} onClick={resetAll}>+ Start a new trip</button>
              </div>
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
