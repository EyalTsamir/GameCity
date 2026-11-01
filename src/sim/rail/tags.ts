// The material tags of the rolling stock (aKind, see trainMaterial.ts), apart so the close level's GLSL can name them without importing the material.

export const T = {
  PLAIN: 0,
  LIVERY: 1,
  WHEEL: 2,
  DOOR: 3,
  WINDOW: 4,
  HEAD: 5,
  TAIL: 6,
  DEST: 7,
  CONT40: 8,
  CONT20A: 9,
  CONT20B: 10,
  DOORWIN: 11,
  GLASS: 12,
  /** the open doorway's back (vestibule seen through it): ray-traced like the windows, aExtra.x = door centre z */
  VESTIB: 13,
  /** the open-door push button on a leaf: slides with it, its ring lit green while the doors are released */
  DOORBTN: 14,
  /** close level: saloon and cab parts (closeGlsl.ts), aExtra = (mode, a, b, cab) */
  INNER: 15,
  /** close level: the lined inside of a door leaf, slides with it */
  LEAF: 16,
  /** close level: running gear, aExtra.x = finish */
  STEEL: 17,
} as const;
