// Colours the town's people wear, by what they are for. Plain sRGB hex strings; the
// looks in appearance.js pick from these lists by a hash of each resident's id, so
// tuning a list changes everybody who draws from it (and nobody else).

export const SKIN = [['#f3d3b5', 30], ['#e8bf9a', 34], ['#d6a47c', 20], ['#c08a62', 11], ['#9c6a47', 5]];

export const HAIR = {
  young: [['#1b1714', 46], ['#2c211b', 26], ['#45311f', 12], ['#5e4330', 6], ['#6f5a4d', 4], ['#5a2a2e', 3], ['#a9834f', 3]],
  adult: [['#1b1714', 52], ['#2c211b', 28], ['#45311f', 13], ['#5e4330', 5], ['#5a2a2e', 2]],
  greying: [['#1b1714', 22], ['#2c211b', 16], ['#57524d', 26], ['#7d7974', 22], ['#a29d97', 14]],
  grey: [['#7d7974', 18], ['#a29d97', 30], ['#c4bfb8', 30], ['#e2ddd6', 22]]
};

export const EYES = '#2a201b';
export const MOUTH = '#a8574c';
export const BLUSH = '#f0a39a';
export const GLASSES = ['#2a2a2c', '#2a2a2c', '#5b3a24', '#a98a4a', '#8d9399', '#3b4f7a'];

// Everyday clothes.
export const TEE = ['#f4f1ea', '#2d2f33', '#8e9298', '#d8a43a', '#9aae8a', '#c7714f', '#b9a6cc', '#efe3c8', '#5f7fa6', '#3f6b57', '#d9867a', '#7a4f3a'];
export const BRIGHT = ['#f6c431', '#ff8fab', '#6cc4f5', '#8bd150', '#ff9e42', '#b59ae0', '#4fd1d9', '#ff6f6a', '#ffffff'];
export const SHIRT = ['#f7f6f2', '#f7f6f2', '#dfeaf6', '#cfdff0', '#f3dfe3', '#e4def0', '#e9e7e1', '#d7e6dc'];
export const POLO = ['#f4f1ea', '#253a5e', '#7a2f3a', '#2e6f73', '#c9b48a', '#6b7a4a', '#4f78a8', '#a8463e', '#e7d9b8'];
export const KNIT = ['#efe4cf', '#c9d6e3', '#e6c9c4', '#d9d2b5', '#bfc9b0', '#f2f0ea'];
export const DENIM = ['#3b5578', '#2f4462', '#5f7ea6', '#26272b'];
export const SLACKS = ['#33363c', '#283247', '#1f2126', '#6d6a63', '#b49f7e', '#4a4d55'];
export const CHINOS = ['#b49f7e', '#8a7a62', '#4d5560', '#2e3b52', '#6b5444', '#a9a59b'];
export const SKIRT = ['#283247', '#1f2126', '#6d6a63', '#b49f7e', '#7a3b46', '#4d6a5a'];
export const BLAZER = ['#24314f', '#33363c', '#1f2126', '#5d636b', '#b8a689', '#3a4a5e'];
export const CARDIGAN = ['#d9c9a8', '#8d949b', '#2f3b55', '#7a3a3f', '#6b6f45', '#c49a3d', '#a7b4c2', '#5c4b3f'];
export const HOODIE = ['#8e9298', '#2d2f33', '#55603f', '#2f3b55', '#7a3a3f', '#cbbfa8', '#4f6f8a'];
export const SNEAKER = ['#f2f2ee', '#f2f2ee', '#2b2c30', '#c9c3b5', '#3c5a8a', '#b8473f'];
export const LEATHER = ['#1e1c1b', '#2a221d', '#4a3426', '#1e1c1b'];
export const BAG = ['#2b2c30', '#3a4a5e', '#7b6a55', '#55603f', '#a14a3c', '#c9b48a', '#5d636b'];
export const TOTE = ['#e9e1cc', '#2b2c30', '#55603f', '#c9b48a', '#7a3a3f', '#3a4a5e'];
export const RANDOSERU = ['#b8323a', '#1f2a4a', '#20201f', '#2f63b0', '#d46a9a', '#6b3b2a', '#6c4aa0', '#2f7a5a'];
export const KIDPACK = ['#ff8fab', '#6cc4f5', '#f6c431', '#8bd150', '#ff9e42', '#b59ae0'];
export const HELMET = ['#f4f1ea', '#1f2023', '#c6372f', '#f2c230', '#8fb8de', '#e99ab4', '#5d6b45', '#b9bec4', '#2f5fa8'];
export const KIDHELMET = ['#ff8fab', '#6cc4f5', '#f6c431', '#8bd150', '#ff9e42', '#ffffff'];

// Work wear.
export const SCRUBS = ['#9cc8e8', '#f3b6c8', '#c7b7e6', '#9fd8c8', '#f4f4f0', '#3d6fa3', '#5aa3a0'];
export const DOC_SCRUBS = ['#4a8f8a', '#3d6f9e', '#6e9a6a', '#2f4f6e'];
export const APRON = ['#2f5a45', '#5a3a28', '#1f2023', '#2a3a55', '#a8382f', '#3f6285', '#c99a2e', '#6b2f3a'];
export const MARKET_APRON = ['#2f5a45', '#2a3a55', '#d9c23a', '#a8382f', '#e8e4dc', '#3f6285'];
export const BOOTS = ['#f2f0ea', '#2f4f8a', '#1f2023', '#2f5a45'];
export const WORK = ['#4d6274', '#2f3f5c', '#7c7362', '#3e6a6a', '#5a5f66', '#2f4f6a'];
export const LOGISTICS = ['#e5793a', '#2f63a8', '#3f8a52', '#d2b23a', '#2b2c30'];
export const POLICE = { uniform: '#2b3d66', trousers: '#232e4a', cap: '#222f50', peak: '#111215', badge: '#d8b54a', vest: '#d6ef3a', strip: '#e6e9ea' };
export const SANITATION = { vests: ['#ff7a1f', '#ff8c1a', '#f5d21f'], strip: '#e6e9ea', clothes: ['#2f3f5c', '#4d5560', '#2f5a6a'], cap: ['#ff7a1f', '#2f3f5c'] };
export const DRIVER = { shirt: ['#cfe0f2', '#bcd4ec', '#f4f4f0'], trousers: '#1f2a44', cap: '#1f2a44', band: '#c9a64a', tie: '#1f2a44' };
export const BANK_VEST = ['#1f2a4a', '#6b1f2e', '#4a4d55', '#24485a'];
export const SCARF = ['#c6372f', '#2f5fa8', '#d8a43a', '#2f7a6a'];
export const TRACK = { jacket: '#22336b', trim: '#f2f2ee', stripe: '#5aa9e0', pants: '#1f2a52' };
export const GOWN = ['#a8c9e0', '#b3d8c8', '#c9d8e8'];
export const SUN_HAT = ['#efe6cf', '#c9b48a', '#f4f1ea', '#8a9a6a', '#e8a6a0', '#5f7fa6', '#d8a43a'];
export const FLAT_CAP = ['#6b5a48', '#3d3a36', '#7a6f60', '#2f3b55', '#8a8478'];
export const GLOVES_WORK = ['#f0ede4', '#8d949b', '#2f4f6a'];
export const LANYARD = ['#2f63b0', '#c6372f', '#2f7a5a', '#1f2023', '#d8a43a', '#6c4aa0'];
export const SILVER = '#c9cdd1';
export const WHITE_COAT = '#f6f6f2';
export const NYLON_BAG = ['#c6372f', '#2f5fa8', '#f4f1ea']; // the red-white-blue market tote, as stripes
