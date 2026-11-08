export type CatalogFormat = 'svg' | 'lottie' | 'png' | 'webp' | 'ttf';

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
    const formatToken = icons ? 'svg' : cell('Format').split(/[\s,]/)[0];
    if (!['svg', 'lottie', 'png', 'webp', 'ttf'].includes(formatToken ?? ''))
      fail('invalid format');
    const format = formatToken as CatalogFormat;
    let size: [number, number] | null = null;
    if (icons) size = [32, 32];
    else if (fonts && !headers.includes('Size')) {
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
