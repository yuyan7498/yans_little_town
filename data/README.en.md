# The data: changing residents, relationships, jobs and schedules

**English** | [繁體中文](README.md)

Everything in the town that is meant to be edited by hand lives in `data/`. After editing, run:

```
npm run check            # same as node tools/check-data.mjs
node tools/check-data.mjs --plans   # also plans every resident's 28 days
```

The checker tells you, in Traditional Chinese, which resident and which field is wrong; it exits with code 1 when there are errors.

Names, job titles, building names and profiles in the data are in Traditional Chinese; the field names and ids are in English.

| File | Contents |
|---|---|
| `town.js` | The map: roads, the canal, `lots` (which building stands on which lot), the night market, helicopter flights |
| `buildings.js` | Every place: name, `kind`, capacity, opening hours |
| `residents.json` | The residents, one per line |
| `relations.json` | Households, relationships, school pick-ups, groups of close friends, circles of old friends |
| `occupations.json` | Occupation categories (display order and names) |
| `profiles.json` | Every resident's profile, keyed by resident `id` |

## Residents (residents.json)

```json
{"id":"office-012","name":"bear_clover87","age":25,"role":"office","job":"會計師","family":"firm","org":"誠信會計師事務所","home":"h-point","work":"t-four","hangout":"c-plaza","birthMonth":10}
```

- `id`: a fixed key that relationships and profiles depend on. **If you change an id, change it in relations.json and profiles.json too.**
- `role` decides how the day goes: `preschooler student-p student-m student-u office worker shopkeeper driver teacher school-admin medical-doc medical-nurse hosp-admin officer clerk sanitation unemployed patient retiree senior`.
- `home`, `work` and `hangout` are place ids from `buildings.js` (`null` when there is no `work`).
- `family` is a category id from `occupations.json`; `job` is the job title; `org` is the employer (optional).
- A `preschooler`'s `work` is `c-primary`: they go to the kindergarten attached to Zhendong Elementary School, dropped off and picked up by family on weekdays (see "Kindergarten" below).
- Optional:
  - `dog`: dog owners give the dog's name (e.g. `"dog":"豆豆"`). This person gets one or two 20–40-minute dog walks a day (activity `dog-walk`), and the info card gains a "dog" line.
  - `schedule`: `mayor`, `president`, `transit-driver` (bus driver, with `crew`), `office-night` (tower night shift).
  - `shift`: doctors, nurses and police use `early|evening|night`; the sanitation team `dawn|evening`; market workers `dawn|morning`.
  - `post`: early-shift police `desk|gate` (`gate` stands school-crossing guard for the last 45 minutes of each school day).
  - `crew`: bus drivers `early|late`.
  - `restDays`: weekdays off, 0 = Monday … 6 = Sunday; without it, days off rotate automatically by occupation.
  - `birthMonth`: the month of their birthday.

### Adding a resident

1. Add a line to `residents.json` (keep one resident per line). The `id` must be unique and the `home` must have room (home capacity is `capacity` in `buildings.js`; the checker prints "residents / capacity" for every home).
2. Add them to a household in `households` in `relations.json` (or make a new household).
3. (Optional) Add a profile in `profiles.json`.
4. Run `npm run check`.

### Removing a resident

Delete their line, and take their id out of `relations.json` (households, links, pickUps, friendGroups, circles) and `profiles.json`; the checker will point out anything you missed.

### Changing jobs, moving house, changing workplace

- Changing jobs: change `role`, `job`, `family`, `org` and `work` (the kind of `work` place has to make sense: offices are in a `tower`, students at a school, medical staff at the `hospital`…; the checker points out combinations that don't).
- Moving house: change `home`. Everyone in a household should live in the same place.
- Changing shifts or days off: change `shift` and `restDays`.

## The stray cat and dog (role: stray)

The town has a stray cat and a stray dog. They count as residents but never enter a building:

```json
{"id":"stray-cat","name":"橘子","age":3,"role":"stray","species":"cat","job":"流浪貓","family":"stray","home":"nest:cat","work":null,"birthMonth":5}
```

- `role` is `stray`, `species` is `cat` or `dog`, and `family` is `stray` (流浪動物, "strays", in occupations.json).
- `home` is the nest id, written `nest:cat` or `nest:dog`, and must match `strays` in `town.js` (the `site` in `strays` decides which place the nest is beside; both nests are currently on the riverbank in front of the town hall). `work` must be `null`.
- They never go into buildings, only between the nest, the streets, shop fronts, benches, parks, plazas and the night market. The cat is a night owl: it sleeps and suns in the nest by day, walks to the night market in the evening to beg and be fed by the stall owners (`beg-food`, `fed`), prowls the town at night (`prowl`) and only walks home at two or three in the morning. The dog goes to the nearest park or plaza at dawn to wait for elders doing their morning exercise to share breakfast, wanders and dozes around town by day (`doze`), goes to the school gate, the amusement park or a plaza to play with the children when school lets out (`play-kids`), and is back in the nest at half past nine. Places too far away (more than about two hours' walk) are skipped. The times are in `src/core/people/schedules/strays.js` and the roaming routes in `wander.js`.
- Their info card shows only "role" and "nest", with no shifts or days off.
- To add one: add a line to residents.json (with a new `id` and `home`), add a nest to `strays` in `town.js`, and give it a routine in `strays.js`.

### The people who look after them (links.caretaker)

```json
"caretaker": [["shopkeeper-051", "stray-cat"], ["retiree-004", "stray-dog"]]
```

`[caretaker, stray]`, 6–10 per animal: stall owners, elders, students and the mayor can all be caretakers. From the person's side it reads "the stray they look after", from the animal's side "the people who look after it". The first is always a resident and the second always a stray.

## Kindergarten (at Zhendong Elementary School)

Preschoolers go to the kindergarten at `c-primary` on weekdays (activity `kindergarten`, about 07:50 to 16:00; when a parent comes later there is an extra stretch of `after-care`):

- In each household, the first adult who "works today, at an office, workshop, logistics centre, bank, the town hall or in hospital administration" drops the child off on the way (`drop-off`); child and adult travel together (the same `party`), and the adult picks the child up on the way home from work (`pick-up-kid`).
- Without such an adult, an adult who isn't working that day, or a grandparent, does the drop-off and pick-up.
- There is no kindergarten at the weekend; stroller walks and the like are all at weekends.

## Relationships (relations.json)

- `households`: `{"id":"hh-1","kind":"couple|single|elders|flat","adults":[...],"kids":[...],"grandparents":[...]}`. `kids` must be younger than `adults`; members of a household live in the same place (`grandparents` don't have to).
- `links`: pairs, written `[a, b]`:
  - `partner`, `old-partner` (long-time spouse), `sibling`, `roommate`, `friend`, `old-friend`, `classmate`, `coworker`: both ways, in any order.
  - `parent`: `[child, parent]`; `grandparent`: `[grandchild, grandparent]`.
  - `caretaker`: `[caretaker, stray]`, see "The people who look after them" above.
  - `fiancee`: `[mayor, fiancée]`; the two have dinner dates on Monday, Wednesday and Friday evenings and spend whole weekends together.
- `pickUps`: `[grandparent, elementary pupil]`; on school days the grandparent waits at the gate before school lets out and takes the child home (or along to the amusement park, if the child is going there).
- `friendGroups`: groups of close friends, who have dinner together two Fridays out of three.
- `circles`: circles of old friends, who sit on a nearby bench to chat five afternoons a week.

To add a relationship, add a pair of ids to the right array; the words the interface uses (partner, parent, coworker…) are generated automatically and never guess anyone's gender.

## Jobs and schedules

Schedules aren't written person by person; they go "occupation → day template":

- The day templates are in `src/core/people/schedules/`, one file per family: `students.js`, `work.js` (office workers, shop staff, teachers…), `shifts.js` (shift work, drivers, patients), `elders.js`, `leisure.js` (days off) and `civic.js` (the mayor, the president).
- Each row is `[start, end, state, place code, activity]`, e.g. `['08:00','12:00','AT_WORK','WORK','class']`. Place codes such as `HOME`, `WORK`, `STREET`, `MALL`, `NIGHT_MARKET`, `BANK`, `OUTDOOR`… are described in `places.js`.
- To change "what share of people do something", shift times or overtime rates, edit `src/core/people/rules.js` (it's all in the constants at the top of the file).
- The Chinese names of activities are in `labels.js`; a new activity needs a line there.
- Schools, office towers and workshops close at weekends; Zhenbei Bank opens Monday–Friday 08:00–17:00 and Saturday until 14:00; the Town Bank head office Monday–Friday 09:00–15:30; the town hall Monday–Friday 08:00–17:00; the night market from 18:00; the zoo 09:00–17:00; the cinema 10:00–24:00; Zhen'an Temple 05:00–22:00; the petrol stations 06:00–23:30. These are `open` and `hours` in `buildings.js`. Plans that point at a closed place turn into staying home.

## The new places and jobs on the outer lots

| Place | Who works here (role → routine) | Who visits |
|---|---|---|
| Town airport `x-airport` | Aircrew: `role: office` + `schedule: aircrew` (see below); ground staff, check-in, the control tower and maintenance: `worker`, with `shift` `early` (05:30–14:00) or `late` (13:00–21:30); the airport shop: `shopkeeper` | Families and children who come to watch the planes at weekends (`plane-spotting`) |
| Town zoo `x-zoo` | Keepers and vets: `worker` (07:30–16:30, rotating days off); tickets and the gift shop: `shopkeeper` | Family outings, couples, adults and children on their days off |
| West / East petrol stations `g-gas-*` | `shopkeeper` (early and late shifts) | People who drive themselves fill up twice a week (`refuel`, on the way home from work or on a morning off); the cars you see at the station are them |
| Town fire station `c-fire` | `officer`, with `shift` `early` / `evening` / `night` | — |
| Zhen'an Temple `c-temple` | `shopkeeper` | Elders come to worship two mornings a week (`worship`), and adults on a day off sometimes too |
| Town Bank head office `c-bank-hq` | `clerk` | People running errands at lunch go to whichever bank is nearer home |
| Starry Sky Cinema `c-cinema` | `shopkeeper` | Students, couples, families (`movie`, `movie-date`, `family-movie`) |
| Cloudtop Villas `h-villa`, Tianxi Residences `h-sky` | Homes (`type: villa`, `luxury`) | — |

### Aircrew (schedule: aircrew)

The town airline's two planes each fly four round trips a day (`airport.departures` in `town.js`), and two trips in a row on the same plane make one duty. All residents with `schedule: aircrew`, sorted by id, form groups of three (captain, first officer, flight attendant), `airport.crews` groups in all, and take turns flying these duties: on a duty day they get to the airport early for briefing, board, fly two trips, debrief and go home; with no duty they have the day off. From pushback to parking on the stand, tap a crew member and they are on the plane; follow them and you follow the plane through take-off, departure, the return and landing. Add aircrew in threes, and set `crews` to the number of groups.

## Moving buildings

Swap the building ids of two lots in `lots` in `town.js`; residents' `home` and `work` are building ids, so they don't need to change.

The airport and the zoo each take up two lots: in `lots` they are written `'A3+A4'` and `'F3+F4'` (two neighbouring lots with no road between them, which is why `中央街` (Central Street) only runs as far as the east and west ring roads). Two merged lots can also swap with each other.
