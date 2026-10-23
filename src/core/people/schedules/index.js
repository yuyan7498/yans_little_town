// Which day template each kind of job (roster.js jobKind) uses. To give a role a new
// kind of day, write a function (resident, day) → rows and list it here; see rows.js
// for the row format and README (data/README.md) for how a person is given a role.

import { preschooler, primary, secondary, university } from './students.js';
import { office, workshop, driver, teacher, schoolAdmin, hospitalAdmin, clerk, shop, stall, zooKeeper } from './work.js';
import { medical, officeNight, officer, firefighter, sanitation, market, transit, patient } from './shifts.js';
import { aircrew, airportGround } from './airport.js';
import { elder } from './elders.js';
import { unemployed, dutyDay } from './leisure.js';
import { mayor, president } from './civic.js';
import { stray } from './strays.js';

export const TEMPLATES = {
  preschool: preschooler, primary, secondary, university,
  office, workshop, depot: workshop, driver, teacher, 'school-admin': schoolAdmin, 'hosp-admin': hospitalAdmin,
  bank: clerk, civic: clerk, shop, stall, market, sanitation, officer, doctor: medical, nurse: medical, patient,
  unemployed, retiree: elder, senior: elder, transit, 'office-night': officeNight, mayor, president, stray,
  aircrew, airport: airportGround, zoo: zooKeeper, fire: firefighter
};

// The day's rows for a resident; weekend duty (minding a shut workplace) replaces an
// ordinary working day, but never a shift worker's night.
export function rowsFor(r, day) {
  if (day.duty && !day.carry) return dutyDay(r, day);
  const template = TEMPLATES[r.kind];
  if (!template) throw new Error(`${r.id}：${r.kind} 沒有對應的日程範本`);
  return template(r, day);
}
