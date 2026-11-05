import type { RoomTemplate } from '../../data/types';
import { BOSS_ROOMS } from './boss';
import { COMBAT_ROOMS } from './combat';
import { CORRIDOR_ROOMS } from './corridor';
import { EXIT_ROOMS } from './exit';
import { SPECIAL_ROOMS } from './special';
import { START_ROOMS } from './start';

/**
 * All room templates. Authoring rules (enforced by tests/unit/world.test.ts):
 *  - exactly ROOM_W x ROOM_H chars, solid outer border
 *  - L/R doors: rows DOOR_SIDE_Y0..DOOR_SIDE_Y1 clear in cols 1..3 / 36..38, floor row 21 solid there
 *  - T door: shaft cols DOOR_VERT_X0..DOOR_VERT_X1 clear of solids/platforms/spikes/ladders in rows 1..20,
 *    with a solid landing on row 21 (the generator drops a ladder at col DOOR_VERT_X0 through the shaft)
 *  - B door: row 21 cols 17..22 solid (cols 18..21 get carved), cols 17 and 22 clear in rows 19..20
 *  - markers sit in the cell directly above the surface they stand on
 */
export const ROOMS: RoomTemplate[] = [
  ...START_ROOMS,
  ...EXIT_ROOMS,
  ...COMBAT_ROOMS,
  ...SPECIAL_ROOMS,
  ...CORRIDOR_ROOMS,
  ...BOSS_ROOMS,
];

export const LEGEND = '#.-^HPXBEFCMAotw';
