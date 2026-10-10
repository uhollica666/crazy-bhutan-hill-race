export const COSMETIC_OPTIONS = {
  paint: [['factory','Factory'],['pearl','Glacier pearl'],['red','Rhododendron red'],['green','Forest green'],['blue','Alpine blue']],
  skin: [['plain','Clean panels'],['stripe','Touring stripe'],['summit','Summit graphics']],
  trim: [['factory','Factory trim'],['dark','Black pack'],['bronze','Bronze pack']],
  equipment: [['standard','Standard roof'],['carrier','Touring carrier'],['lamps','Rally lamps']],
  wheels: [['silver','Silver alloy'],['black','Graphite alloy'],['bronze','Bronze alloy']],
  finish: [['metallic','Metallic clearcoat'],['matte','Matte paint']],
  rim: [['touring','Touring spokes'],['steel','Trail steel'],['sport','Split sport spokes']],
  bumper: [['standard','Factory bumper'],['trail','Trail protection']],
  rack: [['standard','Factory rails'],['basket','Expedition basket']],
} as const;
export type CosmeticKey = keyof typeof COSMETIC_OPTIONS;
export type Cosmetics = Record<CosmeticKey, string>;
const defaults: Cosmetics = {paint:'factory',skin:'plain',trim:'factory',equipment:'standard',wheels:'silver',finish:'metallic',rim:'touring',bumper:'standard',rack:'standard'};
const key = 'cbhr-cosmetics-v1';
export function readCosmetics(id: string): Cosmetics {
  try { const saved = JSON.parse(localStorage.getItem(key) || '{}')[id] || {}; const out = {...defaults};
    for (const k of Object.keys(defaults) as CosmeticKey[]) if (COSMETIC_OPTIONS[k].some(o => o[0] === saved[k])) out[k] = saved[k];
    return out;
  } catch { return {...defaults}; }
}
export function saveCosmetic(id: string, field: CosmeticKey, value: string): Cosmetics {
  const out = readCosmetics(id);
  if (!COSMETIC_OPTIONS[field].some(o => o[0] === value)) return out;
  out[field] = value;
  try { const all = JSON.parse(localStorage.getItem(key) || '{}'); all[id] = out; localStorage.setItem(key, JSON.stringify(all)); } catch { /* Preview still works when storage is unavailable. */ }
  return out;
}
