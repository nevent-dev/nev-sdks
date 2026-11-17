// Guarda de texto fijo de los widgets (nevent-work#40, FAN-052). Uso: node --test scripts/widget-visible-text.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, EXCEPTIONS, findInSource, readBaseline, scan } from './widget-visible-text.mjs';

test('ningún texto visible fuera de los catálogos, salvo la línea base (trinquete estricto)', () => {
  const { added, fixed } = compare(scan(), readBaseline());
  assert.deepEqual(added.map(f => `${f.file}:${f.line} «${f.literal}»`), [],
    'Texto visible nuevo fuera de los catálogos de idioma: pásalo por i18n (o EXCEPTIONS con su motivo).');
  assert.deepEqual(fixed, [],
    'Casos de la línea base que ya no están: bórralos de scripts/widget-visible-text-baseline.txt.');
});

test('la línea base está a 0', () => {
  assert.deepEqual(readBaseline(), []);
});

test('contraexperimento: cada forma de pintar un literal hace saltar la guarda', () => {
  const cases = {
    'a.ts': "el.textContent = 'Gracias por suscribirte';",
    'b.ts': 'input.placeholder = "Your email";',
    'c.ts': "button.setAttribute('aria-label', 'Close chat');",
    'd.ts': "this.showInlineError('Too many messages');",
    'e.ts': "return { valid: false, error: 'Please enter a valid URL' };",
    'f.ts': "const label = config.title || 'Subscribe to our newsletter';",
    'g.ts': 'html = `<label class="x">Email</label>`;',
    'h.tsx': 'const C = () => <button title="Send">Enviar mensaje</button>;',
  };
  for (const [file, source] of Object.entries(cases)) {
    assert.equal(findInSource(`packages/x/src/${file}`, source).length > 0, true, `${file}: ${source}`);
  }
});

test('no confunde código con texto: claves, códigos, CSS, URLs, tipos y comentarios', () => {
  const source = [
    "el.textContent = '';",
    "el.textContent = ' *';",
    "badge.textContent = `${count}`;",
    "style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;",
    "return { error: 'FILE_TYPE_NOT_ALLOWED' };",
    "const k = key || 'submitButton';",
    "const size = s || '12px';",
    "const url = u || 'https://nevent.ai';",
    'const fn = (x: string): Promise<Map<string, number>> => load(x);',
    "// el.textContent = 'comentario';",
    "strong.textContent = 'Nevent';",
  ].join('\n');
  assert.deepEqual(findInSource('packages/x/src/z.ts', source), []);
});

test('cada excepción lleva su motivo', () => {
  for (const [key, reason] of EXCEPTIONS) {
    assert.match(key, /\t/);
    assert.ok(reason && reason.length > 20, key);
  }
});
