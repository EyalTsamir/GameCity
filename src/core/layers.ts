// Shared render layers (three.js Layers bits). Layer 0 is the default camera layer.
//
// REFLECT: objects big enough to show up in the water reflections. The water module renders its
// reflection pass with only this layer enabled; any module may opt a mesh in with
// `mesh.layers.enable(LAYERS.REFLECT)` (keep it to large, cheap-to-draw meshes).

export const LAYERS = {
  DEFAULT: 0,
  REFLECT: 2,
} as const;
