import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
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

export default function Itinerary() {
  const [step, setStep] = useState(1);
  const [destination, setDestination] = useState('');
  const [dates, setDates] = useState({ from: '', to: '' });
  const [travelers, setTravelers] = useState(1);
  const [budget, setBudget] = useState('moderate');
  const [interests, setInterests] = useState(['food', 'places']);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const chatRef = useRef(null);
  const { lang, t } = useLang();
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

  async function handleGenerate() {
    if (!destination.trim()) return;
    setStep(3);
    const prompt = buildPrompt();
    setMessages([{ role: 'assistant', content: `I'll build your ${destination} itinerary now…` }]);
    setLoading(true);
    try {
      const res = await fetch('https://claude-proxy.kairosventure-io.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || 'Sorry, I couldn\'t generate your itinerary. Please try again.';
      setMessages([{ role: 'assistant', content: text }]);
    } catch {
      setMessages([{ role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    }
    setLoading(false);
  }

  function buildPrompt() {
    const cats = interests.map((id) => [...CATEGORIES, ...UNIQUE_CATS].find((c) => c.id === id)?.title).filter(Boolean).join(', ');
    return `You are a knowledgeable travel guide for ${destination}. Create a detailed day-by-day itinerary.
Dates: ${dates.from || 'flexible'} to ${dates.to || 'flexible'}. Travelers: ${travelers}. Budget: ${budget}.
Interests: ${cats || 'general sightseeing'}.
Rules: Only real, verified places with accurate addresses. No hallucinations. Include opening hours, entry prices, and transport tips. Format clearly with day headings.`;
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('https://claude-proxy.kairosventure-io.workers.dev/', {
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
    setLoading(false);
  }

  async function saveItinerary() {
    if (!user) { navigate('/login'); return; }
    const content = messages.find((m) => m.role === 'assistant')?.content || '';
    await supabase.from('saved_itineraries').insert({ user_id: user.id, destination, content, created_at: new Date() });
    alert('Itinerary saved!');
  }

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
                    <label className={styles.label}>From</label>
                    <input type="date" value={dates.from} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>To</label>
                    <input type="date" value={dates.to} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} className={styles.input} />
                  </div>
                </div>

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
            <p className={styles.sub}>Select your interests and we'll tailor the itinerary around them.</p>

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

            <button className={styles.btnGenerate} onClick={handleGenerate}>
              Build my itinerary →
            </button>
          </div>
        )}

        {/* ── Step 3: Chat / itinerary ── */}
        {step === 3 && (
          <div className={styles.chatWrap}>
            <div className={styles.chatHeader}>
              <div>
                <div className={styles.eyebrow}>Your itinerary</div>
                <h1 className={styles.chatH1}>{destination}</h1>
              </div>
              <div className={styles.chatActions}>
                <button className={styles.btnSave} onClick={saveItinerary}>Save itinerary</button>
                <button className={styles.btnRestart} onClick={() => { setStep(1); setMessages([]); setDestination(''); }}>
                  New trip
                </button>
              </div>
            </div>

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
              {loading && (
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
                disabled={loading}
              />
              <button type="submit" className={styles.chatSend} disabled={loading || !input.trim()}>
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
