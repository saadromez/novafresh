export interface UnitOption {
  value: string;
  label: string;
  type: 'count' | 'weight' | 'volume';
}

export const PRODUCT_UNITS: UnitOption[] = [
  { value: 'pc', label: 'Pieces (pc)', type: 'count' },
  { value: 'kg', label: 'Kilograms (kg) - Weighed', type: 'weight' },
  { value: 'g', label: 'Grams (g) - Weighed', type: 'weight' },
  { value: 'l', label: 'Liters (L) - Volume', type: 'volume' },
  { value: 'ml', label: 'Milliliters (ml) - Volume', type: 'volume' },
  { value: 'pack', label: 'Pack (pack)', type: 'count' },
  { value: 'box', label: 'Box (box)', type: 'count' },
  { value: 'bottle', label: 'Bottle (bottle)', type: 'count' },
  { value: 'can', label: 'Can (can)', type: 'count' },
];

export function isWeighedOrVolumeUnit(unit?: string): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase().trim();
  return ['kg', 'kilogram', 'kilograms', 'g', 'gram', 'grams', 'l', 'liter', 'litre', 'liters', 'litres', 'ml', 'milliliter', 'millilitre'].includes(u);
}

export function isWeightUnit(unit?: string): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase().trim();
  return ['kg', 'kilogram', 'kilograms', 'g', 'gram', 'grams'].includes(u);
}

export function isVolumeUnit(unit?: string): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase().trim();
  return ['l', 'liter', 'litre', 'liters', 'litres', 'ml', 'milliliter', 'millilitre'].includes(u);
}

export function formatQuantityWithUnit(qty: number, unit?: string): string {
  const u = (unit || 'pc').toLowerCase().trim();
  const numQty = Number(qty) || 0;

  // If unit is purely numeric (e.g. '8', '1', '12') or empty/unspecified, treat as standard piece count ('pc')
  if (!u || /^\d+$/.test(u)) {
    return `${numQty} ${numQty === 1 ? 'pc' : 'pcs'}`;
  }

  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') {
    if (numQty < 1 && numQty > 0) {
      const grams = Math.round(numQty * 1000);
      return `${grams}g`;
    }
    const formattedKg = Number(numQty.toFixed(3));
    return `${formattedKg} kg`;
  }

  if (u === 'g' || u === 'gram' || u === 'grams') {
    return `${numQty}g`;
  }

  if (u === 'l' || u === 'liter' || u === 'litre' || u === 'liters' || u === 'litres') {
    if (numQty < 1 && numQty > 0) {
      const ml = Math.round(numQty * 1000);
      return `${ml}ml`;
    }
    const formattedL = Number(numQty.toFixed(3));
    return `${formattedL} L`;
  }

  if (u === 'ml' || u === 'milliliter' || u === 'millilitre') {
    return `${numQty}ml`;
  }

  if (u === 'pc' || u === 'pcs' || u === 'piece' || u === 'pieces') {
    return `${numQty} ${numQty === 1 ? 'pc' : 'pcs'}`;
  }

  if (u === 'pack' || u === 'packs' || u === 'packet' || u === 'packets' || u === 'pkt' || u === 'pk') {
    return `${numQty} ${numQty === 1 ? 'pack' : 'packs'}`;
  }

  if (u === 'box' || u === 'boxes') {
    return `${numQty} ${numQty === 1 ? 'box' : 'boxes'}`;
  }

  if (u === 'bottle' || u === 'bottles') {
    return `${numQty} ${numQty === 1 ? 'bottle' : 'bottles'}`;
  }

  if (u === 'can' || u === 'cans') {
    return `${numQty} ${numQty === 1 ? 'can' : 'cans'}`;
  }

  return `${numQty} ${u}`;
}

export const WEIGHT_PRESETS = [
  { label: '100g', value: 0.1, grams: 100 },
  { label: '200g', value: 0.2, grams: 200 },
  { label: '250g', value: 0.25, grams: 250 },
  { label: '500g', value: 0.5, grams: 500 },
  { label: '750g', value: 0.75, grams: 750 },
  { label: '1 kg', value: 1.0, grams: 1000 },
  { label: '1.5 kg', value: 1.5, grams: 1500 },
  { label: '2 kg', value: 2.0, grams: 2000 },
  { label: '5 kg', value: 5.0, grams: 5000 },
];

export const VOLUME_PRESETS = [
  { label: '100ml', value: 0.1, ml: 100 },
  { label: '200ml', value: 0.2, ml: 200 },
  { label: '250ml', value: 0.25, ml: 250 },
  { label: '500ml', value: 0.5, ml: 500 },
  { label: '750ml', value: 0.75, ml: 750 },
  { label: '1 L', value: 1.0, ml: 1000 },
  { label: '1.5 L', value: 1.5, ml: 1500 },
  { label: '2 L', value: 2.0, ml: 2000 },
];
