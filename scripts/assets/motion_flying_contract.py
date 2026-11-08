"""Declared flying profile: raw-coordinate affine placement without pose registration."""
FLYING_STRATEGY = 'unmodified-upstream-raw-component-coordinate-affine-full-cell'
FLYING_OPERATIONS = ['native-chroma-removal', 'upstream-components:exact-mask-membership',
    'official-whole-state-fit-scale:8poses', 'exact-canonical-decoded-pixel-replay:ALL16',
    'raw-coordinate-state-affine:slot-origin-and-row-midline',
    'kCentroid:ALL16-full-cell-one-final-scale', 'binarize_alpha',
    'build_shared_palette:ALL16', 'apply_palette',
    'fixed-full-cycle-temporal-sampling:idle[0,2,4,6];move[0..7]']
