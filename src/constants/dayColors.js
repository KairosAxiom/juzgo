// Shared day-colour palette for the itinerary planner.
// Day 1 red, Day 2 green, Day 3 blue, etc. Index by ((day - 1) % DAY_COLORS.length).
//
// Hoisted (Session 29) from a byte-identical copy that previously lived in
// BOTH src/pages/Itinerary.js and src/components/ItineraryMap.js. Every
// consumer imports this single source of truth so the map pins, the day-list
// editor dots, and the region-card day sub-sections can never drift apart.
// The array and its order MUST stay unchanged — pins are coloured by position.
export const DAY_COLORS = ['#E5484D', '#1E8E5E', '#2A6FDB', '#F0A500', '#8A4FD1', '#00A8A8', '#D6477A', '#5B6B62'];
