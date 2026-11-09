export type CatalogFormat = 'svg' | 'lottie' | 'png' | 'webp' | 'ttf' | 'mp3';

/** ADR 0021: the file of an audio ID by the naming rule, `sfx.hitMagicWand` → `audio/sfx/hit-magic-wand.mp3`. */
export function audioFile(id: string): string {
  const [namespace = '', name = ''] = id.split('.');
  return `audio/${namespace}/${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.mp3`;
}

export interface CatalogRow {
  id: string;
  size: [number, number] | null;
  format: CatalogFormat;
  mass: boolean;
  status: string;
}

export function parseCatalog(markdown: string): CatalogRow[] {
  const rows: CatalogRow[] = [];
  const seen = new Set<string>();
  let heading = '';
  let headers: string[] = [];
  for (const [index, line] of markdown.split('\n').entries()) {
    if (line.startsWith('## ')) {
      heading = line.slice(3);
      headers = [];
    }
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells[0] === 'ID') {
      headers = cells;
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const fail = (reason: string): never => {
      throw new Error(`Catalog line ${String(index + 1)}: ${reason}`);
    };
    if (!headers.length || cells.length !== headers.length) fail('malformed table row');
    const cell = (name: string): string => cells[headers.indexOf(name)] ?? '';
    const ids = [...cell('ID').matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
    if (
      !ids.length ||
      cell('ID')
        .replace(/`[^`]+`/g, '')
        .replace(/[,\s]/g, '')
    )
      fail('invalid ID list');
    const icons = heading.startsWith('Icons');
    const fonts = heading.startsWith('Fonts');
    const sound = heading.startsWith('Sound');
    const formatToken =
      icons && !headers.includes('Format') ? 'svg' : cell('Format').split(/[\s,]/)[0];
    if (!['svg', 'lottie', 'png', 'webp', 'ttf', 'mp3'].includes(formatToken ?? ''))
      fail('invalid format');
    const format = formatToken as CatalogFormat;
    let size: [number, number] | null = null;
    if (icons) size = [32, 32];
    else if (sound) {
      if (format !== 'mp3') fail('sound requires mp3');
      if (!headers.includes('Length') || headers.includes('Size')) fail('sound rows have a Length');
    } else if (fonts && !headers.includes('Size')) {
      if (format !== 'ttf') fail('font requires ttf');
    } else {
      const match = /^(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)$/.exec(cell('Size'));
      if (!match) fail('missing or invalid Size');
      const width = Number(match?.[1]);
      const height = Number(match?.[2]);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        fail('invalid dimensions');
      size = [width, height];
    }
    for (const id of ids) {
      if (!/^[a-z][\w]*(?:\.[\w]+)+$/.test(id) || seen.has(id))
        fail(`invalid or duplicate ID ${id}`);
      if ((format === 'ttf') !== id.startsWith('font.')) fail(`font namespace mismatch ${id}`);
      if ((format === 'mp3') !== /^(?:sfx|music)\.[a-z][A-Za-z0-9]*$/.test(id))
        fail(`audio namespace mismatch ${id}`);
      if (
        format === 'mp3' &&
        cell('File') !== `\`${audioFile(id)}\`` &&
        cell('File') !== audioFile(id)
      )
        fail(`audio file must be ${audioFile(id)}`);
      seen.add(id);
      rows.push({
        id,
        size,
        format,
        mass: cell('Format').includes('**mass**'),
        status: cell('Status'),
      });
    }
  }
  return rows;
}
