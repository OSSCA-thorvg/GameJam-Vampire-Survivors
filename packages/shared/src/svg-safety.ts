/** Shapes counted by the mass budget (ADR 0007: at most 4). */
const SHAPES = new Set(['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline', 'line']);
const FORBIDDEN_IN_MASS = new Set([
  'lineargradient',
  'radialgradient',
  'filter',
  'mask',
  'clippath',
  'image',
  'text',
]);

interface Tag {
  name: string;
  attrs: Map<string, string>;
}

/** A minimal SVG tag scanner (no dependency): every start tag, its lower-cased name and attributes. */
export function scanSvg(text: string): Tag[] {
  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<!\[CDATA\[/i.test(body))
    throw new Error('DOCTYPE, entities, stylesheets and CDATA are not allowed');
  const tags: Tag[] = [];
  for (const match of body.matchAll(/<([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const attrs = new Map<string, string>();
    const raw = match[2] ?? '';
    const rest = raw.replace(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
      (_all, key: string, a?: string, b?: string) => {
        attrs.set(key.toLowerCase(), a ?? b ?? '');
        return '';
      },
    );
    if (rest.replace(/\//g, '').trim())
      throw new Error(`unparsed attribute text in <${match[1] ?? ''}>`);
    tags.push({ name: (match[1] ?? '').toLowerCase(), attrs });
  }
  if (tags[0]?.name !== 'svg') throw new Error('the first element must be <svg>');
  return tags;
}

/** Problems that make an SVG not inert: scripts, event handlers, external references, embedded HTML. */
export function svgSafetyErrors(text: string): string[] {
  const errors: string[] = [];
  for (const tag of scanSvg(text)) {
    if (tag.name === 'script' || tag.name === 'foreignobject') errors.push(`<${tag.name}>`);
    for (const [key, value] of tag.attrs) {
      if (key.startsWith('on')) errors.push(`event handler ${key}`);
      if ((key === 'href' || key === 'xlink:href') && !value.startsWith('#'))
        errors.push(`external reference ${key}="${value}"`);
      if (/url\(\s*(?!['"]?#)/i.test(value)) errors.push(`external url() in ${key}`);
    }
    if (tag.name === 'style') errors.push('<style>');
  }
  if (/javascript:/i.test(text)) errors.push('javascript: URL');
  return errors;
}

/** Problems that put a mass SVG over the ADR 0007 budget. */
export function massBudgetErrors(text: string): string[] {
  const tags = scanSvg(text);
  const errors: string[] = [];
  const shapes = tags.filter((tag) => SHAPES.has(tag.name)).length;
  if (shapes > 4) errors.push(`${String(shapes)} shapes (at most 4)`);
  for (const tag of tags) {
    if (FORBIDDEN_IN_MASS.has(tag.name)) errors.push(`<${tag.name}>`);
    for (const [key, value] of tag.attrs) {
      if (key.startsWith('stroke')) errors.push(`${key} attribute`);
      if (key === 'style' && /stroke/i.test(value)) errors.push('stroke in style');
    }
  }
  return errors;
}
