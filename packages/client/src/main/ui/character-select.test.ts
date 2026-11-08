// @vitest-environment happy-dom
import { CHARACTERS, formatModifier, WEAPONS, type CharacterId } from '@vs/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { mount, type CharacterSelectProps } from './character-select';

const key = (code: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

function setup(selectedId: CharacterId = 'warden') {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const onSelect = vi.fn<(id: CharacterId) => void>();
  const onConfirm = vi.fn<(id: CharacterId) => void>();
  const onBack = vi.fn<() => void>();
  const props: CharacterSelectProps = {
    characters: CHARACTERS,
    selectedId,
    assetUrl: (id) => (id.startsWith('portrait.') ? `/assets/${id}.png` : null),
    onSelect,
    onConfirm,
    onBack,
  };
  const screen = mount(root, props);
  // Like the app: a selection comes back as new props.
  onSelect.mockImplementation((id) => {
    screen.update({ ...props, selectedId: id });
  });
  return { root, screen, onSelect, onConfirm, onBack };
}

const selected = (root: HTMLElement) =>
  root.querySelector('[role="option"][aria-selected="true"]')?.getAttribute('data-character');

afterEach(() => {
  document.body.replaceChildren();
});

it('shows one option per character with portrait, name, description, weapon and formatted modifiers', () => {
  const { root } = setup();
  expect(root.querySelector('[role="listbox"]')).not.toBeNull();
  const cards = [...root.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(cards).toHaveLength(CHARACTERS.length);
  CHARACTERS.forEach((c, i) => {
    const card = cards[i];
    expect(card?.dataset.character).toBe(c.id);
    const img = card?.querySelector('img.portrait');
    expect(img?.getAttribute('src')).toBe(`/assets/${c.portraitId}.png`);
    expect(img?.getAttribute('alt')).toBe(c.displayName);
    expect(card?.querySelector('.character-name')?.textContent).toBe(c.displayName);
    expect(card?.querySelector('.character-desc')?.textContent).toBe(c.description);
    expect(card?.querySelector('.character-weapon')?.textContent).toBe(
      WEAPONS[c.startingWeaponId].name,
    );
    // The weapon icon has no URL here, so it is the magenta box.
    expect(card?.querySelector('.character-weapon .missing')).not.toBeNull();
    expect(
      [...(card?.querySelectorAll('.character-mods li') ?? [])].map((li) => li.textContent),
    ).toEqual(c.modifiers.map(formatModifier));
  });
  expect(selected(root)).toBe('warden');
  expect(document.activeElement?.getAttribute('data-character')).toBe('warden');
});

it('moves the selection with the arrows and A/D (wrapping), and Enter confirms the selected id', () => {
  const { root, onConfirm } = setup();
  key('ArrowRight');
  expect(selected(root)).toBe('ember');
  key('KeyD');
  expect(selected(root)).toBe('swift');
  key('ArrowLeft');
  key('KeyA');
  key('KeyA');
  expect(selected(root)).toBe('aurelia');
  expect(document.activeElement?.getAttribute('data-character')).toBe('aurelia');
  key('Enter');
  key('Enter');
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith('aurelia');
});

it('selects on click, confirms on double-click, and Escape goes back', () => {
  const { root, onSelect, onConfirm, onBack } = setup();
  const ember = root.querySelector<HTMLElement>('[data-character="ember"]');
  ember?.click();
  expect(onSelect).toHaveBeenLastCalledWith('ember');
  expect(selected(root)).toBe('ember');
  ember?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(onConfirm).toHaveBeenCalledWith('ember');
  const again = setup();
  key('Escape');
  expect(again.onBack).toHaveBeenCalledTimes(1);
  expect(onBack).not.toHaveBeenCalled();
});

it('removes every listener on unmount', () => {
  const { root, screen, onSelect, onConfirm, onBack } = setup();
  screen.unmount();
  onSelect.mockClear();
  for (const code of ['ArrowRight', 'KeyD', 'ArrowLeft', 'Enter', 'Escape']) key(code);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
  expect(root.children).toHaveLength(0);
});
