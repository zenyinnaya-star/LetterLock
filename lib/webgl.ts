/** WebGL probe kept outside Stage3D so importing it never pulls three.js into a page bundle. */
export function webglOk(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(location.search).has('2d')) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
