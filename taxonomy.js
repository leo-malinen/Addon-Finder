/* Addon Forge — the plotter's taxonomy.
 *
 * demoweb's search page is the origin plotter: the platforms you use are marks
 * around a drafting field, a crosshair travels to the centroid of whatever you
 * select, and the categories nearest that point become a real query against
 * catalog.js.
 *
 * Everything the plotter is aimed by lives in this one file, which is the
 * "changed later" requirement from the original brief. Edit a coordinate here
 * and the field re-aims; nothing else needs touching.
 */

const TAXONOMY = {

  /* Where each platform's mark sits on the field, in a 0-100 space.
     Move these and every category centroid moves with them. */
  platforms: {
    blender: { x: 16, y: 24 },
    unreal:  { x: 84, y: 24 },
    unity:   { x: 84, y: 76 },
    daz:     { x: 16, y: 76 }
  },

  /* Which tags become plottable categories.
     minCount: a tag needs at least this many addons behind it to earn a label,
     which is what stops the field filling with 60 one-off tags. Drop it to 1 to
     plot everything. */
  categories: {
    minCount: 2,

    /* A category's position is COMPUTED, not authored: it is the centroid of
       the platforms whose addons actually carry that tag, weighted by how many
       carry it. So "procedural" (2 Blender, 2 Unreal) lands exactly between
       those two marks, and "bridge" (6 Daz) lands on Daz.

       Put a tag in here to pin it somewhere else instead. */
    pin: {},

    /* Categories that share a platform mix would otherwise stack on the same
       point, so a group is fanned around its centroid on a small circle.
       Deterministic, ordered by name, so a label never moves between loads. */
    spread: { radius: 12, perRing: 6, squash: 0.92 }
  },

  /* How many of the nearest categories become the recommendation. */
  recommend: 4,

  /* Field furniture. */
  grid: { step: 10, sub: 5 },

  /* The visible window, in svg units (taxonomy space x 6). It is wider than
     the 0-600 platform space on purpose: category labels fan outwards past the
     outermost marks and need margin to sit in, and cropping the empty top and
     bottom keeps the field from being needlessly tall. */
  view: { x: -84, y: 66, w: 768, h: 468 }
};
