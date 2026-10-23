// Search over residents and places. Residents have account-style names, so a query is also
// read as one: "@name", any letter case, and with or without the dots and underscores that
// are easy to forget.
//
//   searchTown('@sunny_fox12', { residents, sites, jobOf, familyLabel }) → { query, people, sites }

// Lower case without dots, underscores or spaces: "Sunny_Fox.12" and "sunnyfox12" read alike.
const bare = s => s.toLowerCase().replace(/[._\s]/g, '');

// What the person typed, as text and as an account. A leading "@" means they are looking
// for a resident by name, so job titles and buildings are left out.
export function readQuery(input) {
  let text = String(input || '').trim();
  const account = text.startsWith('@');
  text = text.replace(/^@+/, '').trim();
  return { text, low: text.toLowerCase(), bare: bare(text), account };
}

// 0 the account as typed, 1 the same but for dots and underscores, 2 starts with the query,
// 3 contains it, -1 not by name.
function nameRank(name, q) {
  const low = name.toLowerCase(), b = bare(name);
  if (low === q.low) return 0;
  if (q.bare && b === q.bare) return 1;
  if (low.startsWith(q.low) || (q.bare && b.startsWith(q.bare))) return 2;
  if (low.includes(q.low) || (q.bare && b.includes(q.bare))) return 3;
  return -1;
}

export function searchTown(input, { residents, sites, jobOf, familyLabel }) {
  const query = readQuery(input);
  if (!query.text) return { query, people: [], sites: [] };
  const ranked = [];
  for (const r of residents) {
    let rank = nameRank(r.name, query);
    if (rank < 0 && !query.account) {
      const j = jobOf(r.id);
      if (j && [j.title, familyLabel.get(j.family), j.org].some(s => s && s.includes(query.text))) rank = 4;
    }
    if (rank >= 0) ranked.push({ r, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const places = query.account ? [] : sites.filter(s => s.name.includes(query.text) || s.group.includes(query.text));
  return { query, people: ranked.map(x => x.r), sites: places };
}
