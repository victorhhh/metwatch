// ---------------------------------------------------------------------------
// Screen shim — ink/React replacement
//
// In the blessed era this module owned the screen singleton and a render
// coalescer. With ink, React drives re-renders automatically; this module
// is kept as a no-op shim so any residual imports compile without changes.
// ---------------------------------------------------------------------------

/** No-op in ink mode — React re-renders on state change. */
export function scheduleRender(): void { /* no-op */ }

/** No-op — ink's render() in index.ts owns the terminal. */
export function createScreen(): void { /* no-op */ }

/** No-op — ink's unmount() in index.ts owns teardown. */
export function destroyScreen(): void { /* no-op */ }
