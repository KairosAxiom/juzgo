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
    const accomLine = noAccommodation
      ? 'Accommodation not yet booked — feel free to suggest a well-located area to stay.'
      : accommodation ? `Staying at: ${accommodation}.` : '';
    const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime}.` : '';
    const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime}.` : '';

    const prompt = `You are a travel research assistant. For a ${dayCount}-day trip to ${destination}, recommend 15-20 specific real places matching these interests: ${cats || 'general sightseeing'}.
${arrivalLine}
${departureLine}
${accomLine}

Respond with ONLY a valid JSON array, no markdown fences, no prose before or after. Each object must have exactly these fields:
{
  "id": "unique-slug-string",
  "name": "Place name",
  "type": "category like Restaurant, Museum, Park",
  "description": "1-2 sentence description, max 25 words",
  "trust": "michelin" | "unesco" | "tourism" | "tripadvisor" | "gem" | "ai",
  "lat": latitude as a number,
  "lng": longitude as a number,
  "day": suggested day number 1 to ${dayCount}
}

Use real, accurate coordinates for ${destination}. Use "michelin" only for actual Michelin-recognized restaurants, "unesco" only for actual UNESCO World Heritage sites, "tourism" for official tourism board recommended spots, "tripadvisor" for well-known traveller favorites, "gem" for genuine hidden local spots, and "ai" as fallback when source confidence is lower. Distribute places roughly evenly across the ${dayCount} days.`;

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

Format with clear day headings (e.g. "## Day 1"), morning/afternoon/evening structure, and a short "Before You Go" tips section at the top. Keep it well-organized and practical. Do not invent additional must-see places beyond the list above, but you may add brief transport or timing tips between stops.`;

    setMessages([{ role: 'assistant', content: `Building your ${destination} itinerary…` }]);

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
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

  async function saveItinerary() {
    if (!user) { navigate('/login'); return; }
    const content = messages.find((m) => m.role === 'assistant')?.content || '';
    await supabase.from('saved_itineraries').insert({ user_id: user.id, destination, content, created_at: new Date() });
    alert('Itinerary saved!');
  }

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
                    {m.content.split('\n').map((line, j) => (
                      <React.Fragment key={j}>{line}{j < m.content.split('\n').length - 1 && <br />}</React.Fragment>
                    ))}
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
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
