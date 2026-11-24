/** The static shop catalog (Technical Spec: "shipped in code"). Prices follow the Core Game Spec. */
export type ItemType = 'back' | 'table' | 'face' | 'flip';
export type BackId = 'blue' | 'red' | 'green' | 'black' | 'plum' | 'gold' | 'cream';
export type FeltId = 'blue' | 'green' | 'oxblood' | 'slate' | 'plum';
export type FaceId = 'default' | 'modern' | 'mono';
export type FlipId = 'classic' | 'snap' | 'spin' | 'fold';
export interface ShopItem { id: string; type: ItemType; key: string; name: string; price: number }

export const CATALOG: ShopItem[] = [
  { id: 'back_blue', type: 'back', key: 'blue', name: 'Classic blue', price: 0 },
  { id: 'back_red', type: 'back', key: 'red', name: 'Classic red', price: 0 },
  { id: 'back_green', type: 'back', key: 'green', name: 'Green lattice', price: 200 },
  { id: 'back_black', type: 'back', key: 'black', name: 'Night', price: 200 },
  { id: 'back_plum', type: 'back', key: 'plum', name: 'Plum', price: 200 },
  { id: 'back_gold', type: 'back', key: 'gold', name: 'Brass', price: 200 },
  { id: 'back_cream', type: 'back', key: 'cream', name: 'Parchment', price: 200 },
  { id: 'table_blue', type: 'table', key: 'blue', name: 'Midnight felt', price: 0 },
  { id: 'table_green', type: 'table', key: 'green', name: 'Club green', price: 250 },
  { id: 'table_oxblood', type: 'table', key: 'oxblood', name: 'Oxblood', price: 250 },
  { id: 'table_slate', type: 'table', key: 'slate', name: 'Slate', price: 250 },
  { id: 'table_plum', type: 'table', key: 'plum', name: 'Plum felt', price: 250 },
  { id: 'face_default', type: 'face', key: 'default', name: 'Classic', price: 0 },
  { id: 'face_modern', type: 'face', key: 'modern', name: 'Grotesk', price: 300 },
  { id: 'face_mono', type: 'face', key: 'mono', name: 'Mono', price: 300 },
  { id: 'flip_classic', type: 'flip', key: 'classic', name: 'Classic flip', price: 0 },
  { id: 'flip_snap', type: 'flip', key: 'snap', name: 'Snap', price: 400 },
  { id: 'flip_spin', type: 'flip', key: 'spin', name: 'Spin', price: 400 },
  { id: 'flip_fold', type: 'flip', key: 'fold', name: 'Fold', price: 400 },
];
export const FREE_ITEMS = CATALOG.filter((i) => i.price === 0).map((i) => i.id);
export const DEFAULT_EQUIPPED: Record<ItemType, string> = { back: 'back_blue', table: 'table_blue', face: 'face_default', flip: 'flip_classic' };
export const itemById = (id: string) => CATALOG.find((i) => i.id === id);
export interface Cosmetics { back: BackId; table: FeltId; face: FaceId; flip: FlipId }
export function cosmeticsFrom(equipped: Record<ItemType, string>): Cosmetics {
  const key = (t: ItemType) => itemById(equipped[t])?.key ?? itemById(DEFAULT_EQUIPPED[t])!.key;
  return { back: key('back') as BackId, table: key('table') as FeltId, face: key('face') as FaceId, flip: key('flip') as FlipId };
}
