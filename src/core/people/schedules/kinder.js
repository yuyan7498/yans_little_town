// The kindergarten inside the primary school (幼兒園): preschoolers go on school days
// from the early morning until the bell at 16:00 (later, when a working parent collects
// them on the way home). A parent drops them off on the way to work and takes the walk
// home with them; where nobody is working, a free grown-up of the house or a grandparent
// does both. Whoever brings the child shares the walk with them: same minutes, a `party`.
//
// The pieces here are rows both sides use, so both always agree to the minute.

export const BELL = 960;           // 16:00, when the school day ends
export const HANDOVER = 8;         // minutes the grown-up stays at the school gate

const shared = party => ({ party, keep: true });

// The walk (shared) from home to the school gate.
export const walkToSchool = (leave, arrive, party) => [leave, arrive, 'COMMUTE', 'STREET', 'commute', shared(party)];
// The grown-up at the gate, handing the child over.
export const dropOffStay = (arrive, school, party) => [arrive, arrive + HANDOVER, 'LEISURE', '@' + school, 'drop-off', { ...shared(party), firm: true }];
// ... or collecting the child.
export const pickUpStay = (arrive, depart, school, party) => [arrive, depart, 'LEISURE', '@' + school, 'pick-up-kid', { ...shared(party), firm: true }];
// The walk (shared) from the school gate home.
export const walkHome = (depart, home, party) => [depart, home, 'COMMUTE', 'STREET', 'commute', shared(party)];
