/**
 * The only meshes the interaction raycast is allowed to test: everything the
 * player can act on, plus the surfaces that should block a look-through
 * (walls, floor, rack bodies). Keeping this flat means the crosshair test
 * touches ~90 objects a frame instead of walking the whole scene graph.
 */
export const pickables = [];

export function registerPickable(object) {
  pickables.push(object);
  return object;
}
