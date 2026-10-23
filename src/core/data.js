// The town's data, as one import. Everything editable lives in data/ (see data/README.md).
import town from '../../data/town.js';
import buildings from '../../data/buildings.js';
import transit from '../../data/transit.js';
import residents from '../../data/residents.json' with { type: 'json' };
import relations from '../../data/relations.json' with { type: 'json' };
import occupations from '../../data/occupations.json' with { type: 'json' };

export { town, buildings, transit, residents, relations, occupations };

// Profiles (bios, traits, secrets) are large and only needed for the info sheet.
let profiles = null;
export function loadProfiles() {
  if (!profiles) profiles = import('../../data/profiles.json', { with: { type: 'json' } }).then(m => m.default, () => ({}));
  return profiles;
}
