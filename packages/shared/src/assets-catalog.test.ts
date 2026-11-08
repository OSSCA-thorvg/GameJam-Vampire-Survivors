// The starter asset pack (#5) stays in sync with the catalog, follows the naming rule, keeps mass art within the
// ADR 0007 budget and stays inert (ADR 0011): assets are fetched by the worker and parsed by ThorVG.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCatalog, type CatalogRow } from './catalog';

const assets = new URL('../../../assets/', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, assets), 'utf8');
const rows = parseCatalog(read('CATALOG.md'));
const byId = new Map(rows.map((row) => [row.id, row]));
interface Entry {
  file: string;
  format: string;
  size?: [number, number];
  anchor?: [number, number];
}
const manifest = JSON.parse(read('manifest.json')) as { assets: Record<string, Entry> };
const entries = Object.entries(manifest.assets);

/** Catalog section folders (`assets/CATALOG.md` headings), by the ID's first segment. */
const FOLDERS: Record<string, string> = {
  player: 'characters',
  portrait: 'characters',
  enemy: 'enemies',
  boss: 'bosses',
  weapon: 'weapons',
  icon: 'icons',
  gem: 'pickups',
  pickup: 'pickups',
  stage: 'stage',
  fx: 'fx',
  ui: 'ui',
  font: 'fonts',
};
const EXTENSIONS: Record<string, string> = {
  svg: 'svg',
  lottie: 'json',
  png: 'png',
  webp: 'webp',
  ttf: 'ttf',
};
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

/** The naming rule in assets/README.md: the ID without its first segment, kebab-case, joined with hyphens. */
function expectedFile(row: Pick<CatalogRow, 'id' | 'format'>): string {
  const parts = row.id.split('.');
  const first = parts[0] ?? '';
  const kept = first === 'portrait' || first === 'gem' ? parts : parts.slice(1);
  const name = kept.map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
  return `${FOLDERS[first] ?? '?'}/${name.join('-')}.${EXTENSIONS[row.format] ?? '?'}`;
}

interface Tag {
  name: string;
  attrs: Map<string, string>;
}

/** A minimal SVG tag scanner (no dependency): every start tag, its lower-cased name and attributes. */
function scanSvg(text: string): Tag[] {
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
function svgSafetyErrors(text: string): string[] {
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
function massBudgetErrors(text: string): string[] {
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

/** Problems that make a Lottie file unsafe or malformed: missing fields, image assets, expressions. */
function lottieErrors(text: string): string[] {
  const errors: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return ['invalid JSON'];
  }
  if (typeof json !== 'object' || json === null) return ['not an object'];
  const root = json as Record<string, unknown>;
  for (const key of ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers'])
    if (!(key in root)) errors.push(`missing ${key}`);
  if (Array.isArray(root.assets))
    for (const asset of root.assets as Record<string, unknown>[])
      if ('p' in asset) errors.push('image asset (p)');
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        walk(item, `${path}[${String(i)}]`);
      });
    } else if (typeof value === 'object' && value !== null)
      for (const [key, child] of Object.entries(value)) {
        // Expressions are strings in `x`; easing handles also use `x`, but as numbers or number arrays.
        if (key === 'x' && typeof child === 'string') errors.push(`expression at ${path}.x`);
        if (key === 'ty' && (child === 2 || child === 5))
          errors.push(`image or text layer at ${path}`);
        walk(child, `${path}.${key}`);
      }
  };
  walk(json, '$');
  return errors;
}

describe('starter asset pack', () => {
  it('the catalog ID set equals the manifest key set', () => {
    expect(entries.map(([id]) => id).sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it('every catalog row has a valid status and none is still needed', () => {
    const bad = rows.filter((row) => !['placeholder', 'final'].includes(row.status));
    expect(bad.map((row) => `${row.id}: ${row.status}`)).toEqual([]);
  });

  it('every manifest file follows the naming rule, exists and matches its catalog format and size', () => {
    const errors: string[] = [];
    for (const [id, entry] of entries) {
      const row = byId.get(id);
      if (!row) continue;
      if (entry.file !== expectedFile(row))
        errors.push(`${id}: ${entry.file} != ${expectedFile(row)}`);
      if (entry.format !== row.format)
        errors.push(`${id}: format ${entry.format} != ${row.format}`);
      if (!entry.file.endsWith(`.${EXTENSIONS[entry.format] ?? '?'}`))
        errors.push(`${id}: extension does not match ${entry.format}`);
      if (!existsSync(new URL(entry.file, assets))) errors.push(`${id}: ${entry.file} is missing`);
      if (row.size && JSON.stringify(entry.size) !== JSON.stringify(row.size))
        errors.push(`${id}: manifest size ${JSON.stringify(entry.size)} != catalog`);
    }
    expect(errors).toEqual([]);
  });

  it('anchors follow the style guide', () => {
    const errors: string[] = [];
    for (const [id, entry] of entries) {
      if (!entry.anchor) continue;
      const expected = id.startsWith('player.')
        ? [0.5, 0.9]
        : id === 'stage.ground'
          ? [0, 0]
          : [0.5, 0.5];
      if (JSON.stringify(entry.anchor) !== JSON.stringify(expected))
        errors.push(`${id}: anchor ${JSON.stringify(entry.anchor)}`);
    }
    expect(errors).toEqual([]);
  });

  it('every SVG parses, declares its catalog size and is inert', () => {
    const errors: string[] = [];
    for (const [id, entry] of entries) {
      if (entry.format !== 'svg') continue;
      const text = read(entry.file);
      try {
        const svg = scanSvg(text)[0];
        const [width, height] = byId.get(id)?.size ?? [];
        if (
          svg?.attrs.get('xmlns') !== 'http://www.w3.org/2000/svg' ||
          svg.attrs.get('width') !== String(width) ||
          svg.attrs.get('height') !== String(height) ||
          svg.attrs.get('viewbox') !== `0 0 ${String(width)} ${String(height)}`
        )
          errors.push(
            `${id}: <svg> must declare xmlns, width/height and viewBox ${String(width)}×${String(height)}`,
          );
        for (const problem of svgSafetyErrors(text)) errors.push(`${id}: ${problem}`);
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('every mass SVG is within the ADR 0007 budget', () => {
    const mass = rows.filter((row) => row.mass);
    expect(mass.length).toBeGreaterThan(0);
    const errors = mass.flatMap((row) => {
      const entry = manifest.assets[row.id];
      if (!entry) return [`${row.id}: no manifest entry`];
      if (entry.format !== 'svg') return [`${row.id}: mass art must be svg`];
      return massBudgetErrors(read(entry.file)).map((problem) => `${row.id}: ${problem}`);
    });
    expect(errors).toEqual([]);
  });

  it('every Lottie file is shape-only and has no expressions', () => {
    const lotties = entries.filter(([, entry]) => entry.format === 'lottie');
    expect(lotties.length).toBeGreaterThan(0);
    const errors = lotties.flatMap(([id, entry]) =>
      lottieErrors(read(entry.file)).map((problem) => `${id}: ${problem}`),
    );
    expect(errors).toEqual([]);
  });
});

describe('asset checks reject what they must', () => {
  const head = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">';
  it.each([
    ['a script', `${head}<script>alert(1)</script></svg>`],
    ['an event handler', `${head}<path onload="x()" d="M0 0h8v8z"/></svg>`],
    ['an external href', `${head}<use href="https://example.test/a.svg#x"/></svg>`],
    ['an external xlink:href', `${head}<image xlink:href="evil.png"/></svg>`],
    ['foreignObject', `${head}<foreignObject><div/></foreignObject></svg>`],
    ['an external url()', `${head}<path fill="url(https://example.test/x)" d="M0 0z"/></svg>`],
  ])('flags %s as not inert', (_name, text) => {
    expect(svgSafetyErrors(text)).not.toEqual([]);
  });
  it('rejects a doctype with entities', () => {
    expect(() => scanSvg(`<!DOCTYPE svg [<!ENTITY a "b">]>${head}</svg>`)).toThrow();
  });
  it('accepts local fragment references', () => {
    expect(
      svgSafetyErrors(
        `${head}<defs><radialGradient id="g"/></defs><circle fill="url(#g)" r="1"/></svg>`,
      ),
    ).toEqual([]);
  });
  it.each([
    ['five shapes', `${head}${'<rect width="1" height="1"/>'.repeat(5)}</svg>`],
    ['a stroke', `${head}<path stroke="#fff" d="M0 0h8"/></svg>`],
    ['a stroke in style', `${head}<path style="stroke:#fff" d="M0 0h8"/></svg>`],
    ['a gradient', `${head}<linearGradient id="g"/><path fill="url(#g)" d="M0 0h8"/></svg>`],
  ])('flags %s as over the mass budget', (_name, text) => {
    expect(massBudgetErrors(text)).not.toEqual([]);
  });
  it('flags Lottie expressions and image assets but not easing handles', () => {
    const base = { v: '5.7.4', fr: 30, ip: 0, op: 10, w: 8, h: 8, layers: [] };
    expect(lottieErrors(JSON.stringify(base))).toEqual([]);
    expect(
      lottieErrors(JSON.stringify({ ...base, layers: [{ ks: { o: { x: 'time * 2', k: 1 } } }] })),
    ).not.toEqual([]);
    expect(
      lottieErrors(JSON.stringify({ ...base, assets: [{ id: 'i', p: 'x.png' }] })),
    ).not.toEqual([]);
    expect(
      lottieErrors(JSON.stringify({ ...base, layers: [{ o: { x: [0.3], y: [0] } }] })),
    ).toEqual([]);
  });
});
