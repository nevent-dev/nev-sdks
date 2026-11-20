// Guarda de texto fijo de los widgets (nevent-work#40, FAN-052). Uso: node --test scripts/widget-visible-text.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, EXCEPTIONS, findInSource, localeMapProblems, readBaseline, scan, scanLocaleMaps } from './widget-visible-text.mjs';

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

test('los mapas y catálogos tienen todas las claves para cada idioma ofrecido', () => {
  assert.deepEqual(scanLocaleMaps(), []);
});

test('contraexperimento: un idioma, una clave o una traducción pt-PT que falta hacen fallar la guarda', () => {
  const entries = {
    es: "    title: 'Bienvenida',",
    pt: "    other: 'Converse conosco',",
  };
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'en', 'pt'], ['title']), [
    'chatbot: locales es, pt',
    'chatbot.pt: translation keys differ',
    'chatbot.pt: conosco',
  ]);
});

test('contraexperimento: fr requiere todas las claves, la traducción y espacio de no separación', () => {
  const entries = {
    es: "    title: 'Bienvenida',",
    fr: "    body: 'Type a message',\n    hint: 'Une question ?',",
  };
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'fr'], ['title']), [
    'chatbot.fr: translation keys differ',
    'chatbot.fr: Type a message',
    'chatbot.fr: invalid French typography: Une question ?',
  ]);
});


test('it rejects another language and spaces before punctuation', () => {
  const entries = { es: "    title: 'Escribe un mensaje',", it: "    title: 'Type a message ?',", };
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'it'], ['title']), [
    'chatbot.it: Type a message',
    'chatbot.it: invalid Italian typography: Type a message ?',
  ]);
  entries.it = "    title: 'Selezionare un file.',";
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'it'], ['title']), [
    'chatbot.it: formal register: Selezionare un file.',
  ]);
  entries.it = "    title: 'Apri l’{{item}}.',";
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'it'], ['title']), [
    'chatbot.it: invalid Italian typography: Apri l’{{item}}.',
  ]);
  entries.it = "    title: 'Benvenut* in Nevent.',";
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'it'], ['title']), [
    'chatbot.it: invalid Italian typography: Benvenut* in Nevent.',
  ]);
  entries.it = "    title: 'Apri l’app: «Aiuto».',";
  assert.deepEqual(localeMapProblems('chatbot', entries, ['es', 'it'], ['title']), []);
});

test('de checks text, register, typography, compounds and short label length', () => {
  const es = "    title: 'Ayuda',";
  const captures = (title) => localeMapProblems('chatbot', { es, de: `    title: '${title}',` }, ['es', 'de'], ['title']);
  assert.deepEqual(captures('Hilfe'), []);
  assert.ok(captures('Type a message').includes('chatbot.de: Type a message'));
  assert.ok(captures('Brauchst du Hilfe?').some(problem => problem.includes('informal register')));
  assert.ok(captures('Klicken sie auf ihr Konto.').some(problem => problem.includes('informal register')));
  assert.ok(captures('Öffnen sie das Ticket.').some(problem => problem.includes('informal register')));
  assert.ok(!captures('Öffnen Sie das Ticket.').some(problem => problem.includes('informal register')));
  assert.ok(captures('„Hilfe ?“').some(problem => problem.includes('invalid German typography')));
  assert.ok(captures('Hilfe ?').some(problem => problem.includes('invalid German typography')));
  assert.ok(captures('E-Mail Adresse').some(problem => problem.includes('invalid German compound')));
  assert.ok(captures('Unterstützung').some(problem => problem.includes('label exceeds')));
});
