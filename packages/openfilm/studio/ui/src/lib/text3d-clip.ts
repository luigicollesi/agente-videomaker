/** Logical Text 3D category: page clips remain pages in the OpenFilm player. */
export const TEXT3D_KIND = 'text3d';
export const TEXT3D_MARK = 'data-openfilm-content-type';
export const TEXT3D_VERSION = 'data-text3d-version';
export function isText3DClip(clip: { src?: string; attrs?: Record<string,string> } | null | undefined): boolean {
  if (!clip) return false;
  return clip.attrs?.[TEXT3D_MARK] === TEXT3D_KIND ||
    /(?:^|\/)text3d-motion\.html(?:#|$)/.test(clip.src ?? '');
}
export function text3DEligibility(src: string, text: boolean): {projection: boolean; geometry: boolean; reason: string} {
  const page = /\.html?(?:#.*)?$/i.test(src);
  if (!page || !text) return {projection:false,geometry:false,reason:'Select an HTML text clip.'};
  return {projection:true,geometry:false,reason:'Automatic glyph extrusion is not yet available for arbitrary HTML.'};
}
