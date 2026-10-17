// Shared "look" constants for the sky and post-processing modules, so tone mapping
// is configured identically whether or not the post-processing chain is running
// (and is applied exactly once either way).

import * as THREE from 'three';

/** Tone-mapping operator used by the renderer (no-postfx fallback) and the post chain. */
export const TONE_MAPPING: THREE.ToneMapping = THREE.AgXToneMapping;
