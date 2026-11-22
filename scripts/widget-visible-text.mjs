/**
 * Guarda de texto fijo de los widgets (nevent-work#40, FAN-052; control 9 del informe de idiomas).
 *
 * Busca en el código de los widgets (subscriptions, chatbot y widget) literales de texto que llegan a la pantalla sin
 * pasar por un catálogo de idioma: asignaciones a textContent/innerText/innerHTML/placeholder/title/alt, atributos
 * visibles con setAttribute, avisos (showError, showInlineError, showSuccess, announce), las claves de un objeto que
 * se pintan (displayName, placeholder, error) y el texto y los atributos visibles de JSX. Los catálogos (i18n) quedan
 * fuera: ahí es donde debe estar el texto.
 *
 * Trinquete estricto: el resultado tiene que coincidir con la línea base (`scripts/widget-visible-text-baseline.txt`).
 * Un literal nuevo hace fallar la guarda, y también uno de la línea base que ya no está (hay que bajarla). Las
 * excepciones legítimas van en EXCEPTIONS, cada una con su motivo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = path.join(REPO, 'scripts', 'widget-visible-text-baseline.txt');

const ROOTS = ['packages/subscriptions/src', 'packages/chatbot/src', 'packages/widget/src'];

/** Los catálogos de idioma: el sitio correcto del texto visible. */
const CATALOGS = [
  /^packages\/subscriptions\/src\/newsletter\/i18n\//,
  /^packages\/chatbot\/src\/chatbot\/i18n-manager\.ts$/,
  /^packages\/chatbot\/src\/chatbot\/locales\/[a-z]{2}\.ts$/,
  /^packages\/widget\/src\/contract\/locale\.ts$/,
  /^packages\/widget\/src\/panel\/strings\.ts$/,
];

/** Literales que se ven y no se traducen, con su motivo. Clave: `fichero<TAB>literal`, o `*<TAB>literal`. */
export const EXCEPTIONS = new Map([
  ['*\tNevent', 'Marca: se escribe igual en todos los idiomas'],
  ['packages/subscriptions/src/newsletter/schema-injector.ts\tNewsletter',
    'Nombre por defecto del JSON-LD de schema.org para buscadores, no se pinta en el widget'],
  ['packages/subscriptions/src/newsletter/subscription-error.ts\tRequest failed',
    'Mensaje técnico del Error que recibe el onError del integrador; el widget muestra su propio texto traducido'],
  ['packages/chatbot/src/chatbot-widget.ts\tUpload failed',
    'Estado interno del adjunto (attachment.error): la interfaz solo pinta un borde rojo, nunca este texto'],
]);

const SINKS = [
  // el.textContent = 'x', el.placeholder = "x", el.title = `x`
  /\.(?:textContent|innerText|innerHTML|placeholder|title|alt)\s*=\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
  // el.setAttribute('aria-label', 'x')
  /setAttribute\(\s*['"](?:aria-label|aria-description|aria-placeholder|title|placeholder|alt)['"]\s*,\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
  // showError('x'), this.showInlineError("x")
  /\b(?:showError|showInlineError|showSuccess|announce)\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
  // fallback visible: config.x || 'Texto'
  /\|\|\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
  // { displayName: 'x' }, { placeholder: 'x' }, { error: 'x' }
  /\b(?:displayName|placeholder|error|label|ariaLabel)\s*:\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
];
const JSX_SINKS = [
  // >Texto< (no `=>` ni `->`: genéricos y flechas de TypeScript)
  /()(?<![=\-])>([^<>{}=;()]*[A-Za-zÀ-ÿ]{2}[^<>{}=;()]*)</g,
  // aria-label="x" title="x" placeholder="x" alt="x"
  /\b(?:aria-label|title|placeholder|alt)=(["'])([^"'{}]*)\1/g,
];

/** Si un literal es texto que lee una persona: palabras, no códigos, CSS, URLs ni plantillas sin texto. */
export function isVisibleText(literal) {
  // HTML de una plantilla: cuenta el texto entre etiquetas, no las etiquetas ni sus atributos
  const text = literal.replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^[,:|&]/.test(text) || /&&|\|\|/.test(text)) return false; // tipos u operadores de TypeScript, no texto
  if (/^-?[\d.]+[a-z%]*$/i.test(text)) return false; // medidas CSS (12px, 1.5em, 50%)
  if (!/[A-Za-zÀ-ÿ]{2}/.test(text)) return false;
  if (/^[A-Z0-9_:.-]+$/.test(text)) return false; // códigos de error o claves
  if (/^[a-z][\w.-]*$/.test(text) && !/\s/.test(text)) return false; // identificadores, clases, claves i18n
  if (/^(?:https?:|mailto:|#|@keyframes|@media|\.|\/)/.test(text) || /[{};]/.test(text)) return false;
  return true;
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.(test|spec|d)\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Quita comentarios conservando los saltos de línea (para que los números de línea sigan valiendo). */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

/** Los literales visibles de un fichero: `{ file, line, literal }`. */
export function findInSource(rel, source) {
  const code = stripComments(source);
  // JSX y las plantillas HTML en template literals de los .ts (innerHTML = `<label>Email</label>`)
  const sinks = [...SINKS, ...JSX_SINKS];
  const found = [];
  for (const sink of sinks) {
    for (const match of code.matchAll(sink)) {
      const literal = match[2].replace(/\s+/g, ' ').trim();
      if (!isVisibleText(literal)) continue;
      if (EXCEPTIONS.has(`*\t${literal}`) || EXCEPTIONS.has(`${rel}\t${literal}`)) continue;
      found.push({ file: rel, line: code.slice(0, match.index).split('\n').length, literal });
    }
  }
  return found;
}

/** Todos los literales visibles fuera de los catálogos, ordenados. */
export function scan(repo = REPO) {
  const found = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(path.join(repo, root))) {
      const rel = path.relative(repo, file).split(path.sep).join('/');
      if (CATALOGS.some(c => c.test(rel))) continue;
      found.push(...findInSource(rel, readFileSync(file, 'utf8')));
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** La línea base: una línea `fichero<TAB>literal` por caso (sin número de línea, para que no cambie al editar). */
export function readBaseline(file = BASELINE) {
  return readFileSync(file, 'utf8').split('\n').filter(line => line && !line.startsWith('#'));
}

/** Diferencia estricta entre lo encontrado y la línea base. */
export function compare(found, baseline) {
  const keys = found.map(f => `${f.file}\t${f.literal}`);
  const added = found.filter(f => !baseline.includes(`${f.file}\t${f.literal}`));
  const fixed = baseline.filter(line => !keys.includes(line));
  return { added, fixed };
}

const PORTUGUESE_COPY = /(?<![\p{L}\p{M}])(?:você|vocês|conosco|arquivo|celular|conectando|reconectando|contato|senha|nova aba|subscripci[oó]n|subscricao|politica de privacidade|e-mail|tu|teu|tua)(?![\p{L}\p{M}])/iu;

const REQUIRED_LOCALES = ['es', 'en', 'ca', 'pt', 'fr', 'it', 'de'];
const FRENCH_COPY = /(?<![\p{L}\p{M}])(?:haz clic|introduce tu|sin conexión|tu cuenta|todos los derechos reservados|click here|type a message|your account|new conversation|sem ligação|tente novamente|courriel)(?![\p{L}\p{M}])/iu;
const FRENCH_TYPOGRAPHY = /(?:\p{L}'\p{L}|\.{3}|«(?!\u00a0)|(?<!\u00a0)»|[\p{L}\p{N}] *(?:[;!?%]|:(?![/\d])))/u;
const ITALIAN_COPY = /(?<![\p{L}\p{M}])(?:haz clic|introduce tu|sin conexión|tu cuenta|click here|type a message|your account|new conversation|sem ligação|tente novamente|cliquez ici|saisissez votre|vous êtes hors ligne|nouvelle conversation)(?![\p{L}\p{M}])/iu;
const ITALIAN_TYPOGRAPHY = /(?:\p{L}'\p{L}|\.{3}|—|[ \u00a0\u202f]+[:;!?]|«\s|\s»|\p{L}[*əƏ](?!\p{L}))/u;
const ITALIAN_ELISION = /\p{L}[’']\s*(?:\$\{|\{)/u;
const ITALIAN_REGISTER = /(?:\b(?:Lei|Suo|Sua|Suoi|Sue)\b|\b[Ll]a preghiamo\b|(?:^|[.!?]\s+)\s*(?:[Ff]are clic|[Ss]elezionare)\b)/u;
const GERMAN_COPY = /(?<![\p{L}\p{M}])(?:haz clic|tu cuenta|escribe un mensaje|sin conexión|type a message|your account|new conversation|try again|sem ligação|tente novamente|saisissez votre|nouvelle conversation|scrivi un messaggio|nuova conversazione)(?![\p{L}\p{M}])/iu;
const GERMAN_REGISTER = /\b(?:du|dich|dir|dein(?:e[mnrs]?)?)\b/iu;
const GERMAN_FORMAL_CASE = /(?<![\p{L}\p{M}])(?:(?:Klicken|Geben|Wählen|Öffnen|Melden|Schreiben|Versuchen|Prüfen|Formulieren|Warten|Drücken) sie|(?:Sie|sie) (?:auf )?ihr(?:e[nmrs]?)? (?:Konto|Passwort|Ticket|E-Mail-Adresse))(?![\p{L}\p{M}])/u;
const GERMAN_TYPOGRAPHY = /(?:["«»“”„‘‚]|\.{3}|—|[ \u00a0\u202f]+[:;!?]|\p{L}[:*_]innen\b|\p{L}Innen\b)/u;
const GERMAN_COMPOUND = /\b(?:(?:E-Mail|QR|SMS|App|Nevent|Support) (?:Adresse|Code|Kampagne|Benachrichtigung|Logo|Chat|Konto)|(?:e-mail|qr-code|nachricht|datei|frage|datenschutzerklärung))\b/u;
const CATALOG_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

function objectBody(code, name) {
  return new RegExp(`^\\w*\\s*const ${name}(?::[^\\n]+)? = \\{\\n([\\s\\S]*?)^\\}`, 'm').exec(code)?.[1] ?? '';
}

function keysAt(body, indent) {
  return [...body.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z][\\w]*):`, 'gm'))].map(match => match[1]).sort();
}

const SHORT_LABEL = /(?:aria|hint|title|label|placeholder|button|status|close|send|retry|^(?:yes|no|today|attach|stop|nextCard|previousCard|jumpLatest)$)/i;

// No shorter standard word. Keep the exact copy and verify the space in the browser (#442, t442-edge).
const GERMAN_LENGTH_EXCEPTIONS = {
  'chatbot-renderers.today': 'Heute',
  'support-panel.today': 'Heute',
  'support-panel.no': 'Nein',
};

function checkGerman(name, spanish, german, indent) {
  const problems = [];
  for (const [, , literal] of german.matchAll(CATALOG_LITERAL)) {
    const visible = literal.replace(/\$\{[^}]*\}|\{\{?[A-Za-z]\w*\}\}?/g, 'x');
    const expression = visible.match(GERMAN_COPY)?.[0];
    if (expression) problems.push(`${name}.de: ${expression}`);
    if (GERMAN_REGISTER.test(visible) || GERMAN_FORMAL_CASE.test(visible)) problems.push(`${name}.de: informal register: ${literal}`);
    if (GERMAN_TYPOGRAPHY.test(visible.replace(/„([^„“]*)“/g, '$1').replace(/‚([^‚‘]*)‘/g, '$1'))) {
      problems.push(`${name}.de: invalid German typography: ${literal}`);
    }
    if (GERMAN_COMPOUND.test(visible)) problems.push(`${name}.de: invalid German compound or case: ${literal}`);
  }
  const labels = body => {
    const pattern = new RegExp(`^${' '.repeat(indent)}([A-Za-z][\\w]*):\\s*'([^'\\n]*)',?`, 'gm');
    return new Map([...body.matchAll(pattern)].map(([, key, value]) => [key, value]));
  };
  const reference = labels(spanish);
  for (const [key, label] of labels(german)) {
    const source = reference.get(key);
    if (SHORT_LABEL.test(key) && source?.length <= 25 && label.length > 1.6 * source.length
        && GERMAN_LENGTH_EXCEPTIONS[`${name}.${key}`] !== label) {
      problems.push(`${name}.de.${key}: label exceeds 1.6 times the Spanish length`);
    }
  }
  return problems;
}

export function localeMapProblems(name, entries, languages, keys, indent = 4) {
  const problems = [];
  const actual = Object.keys(entries).sort();
  if (actual.join(',') !== [...languages].sort().join(',')) problems.push(`${name}: locales ${actual.join(', ')}`);
  for (const [locale, body] of Object.entries(entries)) {
    if (keys && keysAt(body, indent).join(',') !== keys.join(',')) {
      problems.push(`${name}.${locale}: translation keys differ`);
    }
    if (locale === 'pt') {
      const expression = body.match(PORTUGUESE_COPY)?.[0];
      if (expression) problems.push(`${name}.pt: ${expression}`);
    }
    if (locale === 'de') problems.push(...checkGerman(name, entries.es ?? '', body, indent));
    if (locale === 'fr' || locale === 'it') {
      const copy = locale === 'fr' ? FRENCH_COPY : ITALIAN_COPY;
      const typography = locale === 'fr' ? FRENCH_TYPOGRAPHY : ITALIAN_TYPOGRAPHY;
      const language = locale === 'fr' ? 'French' : 'Italian';
      for (const [, , literal] of body.matchAll(CATALOG_LITERAL)) {
        const visible = literal.replace(/\$\{[^}]*\}|\{\{?[A-Za-z]\w*\}\}?/g, ' ');
        const expression = visible.match(copy)?.[0];
        if (expression) problems.push(`${name}.${locale}: ${expression}`);
        if (typography.test(visible) || (locale === 'it' && ITALIAN_ELISION.test(literal))) {
          problems.push(`${name}.${locale}: invalid ${language} typography: ${literal}`);
        }
        if (locale === 'it' && ITALIAN_REGISTER.test(visible)) problems.push(`${name}.it: formal register: ${literal}`);
      }
    }
  }
  return problems;
}

export function scanLocaleMaps(repo = REPO) {
  const read = file => stripComments(readFileSync(path.join(repo, file), 'utf8'));
  const collect = (body, regexp) => Object.fromEntries([...body.matchAll(regexp)].map(([, key, value]) => [key, value]));
  const newsletterRoot = 'packages/subscriptions/src/newsletter/i18n';
  const registry = objectBody(read(`${newsletterRoot}/index.ts`), 'NEWSLETTER_LOCALES');
  const newsletterLocales = [...registry.matchAll(/^  ([a-z]{2}),/gm)].map(([, locale]) => locale);
  const newsletter = Object.fromEntries(newsletterLocales.map(locale => [locale, objectBody(read(`${newsletterRoot}/${locale}.ts`), locale)]));

  const chatbot = 'packages/chatbot/src';
  const supported = /\btype SupportedLocale = ([^;\n]+)/.exec(read(`${chatbot}/types.ts`))?.[1] ?? '';
  const chatbotLocales = [...supported.matchAll(/'([a-z]{2})'/g)].map(([, locale]) => locale);
  const config = read(`${chatbot}/chatbot/config-manager.ts`);
  const configLocales = /\bconst SUPPORTED_LOCALES[^=]+=(.*?);/s.exec(config)?.[1] ?? '';
  const acceptedChatbotLocales = [...configLocales.matchAll(/'([a-z]{2})'/g)].map(([, locale]) => locale);
  const localeRegistry = read(`${chatbot}/chatbot/i18n-manager.ts`);
  const registeredChatbotLocales = [
    /import defaultCatalog from '\.\/locales\/([a-z]{2})'/.exec(localeRegistry)?.[1],
    ...[...localeRegistry.matchAll(/import\('\.\/locales\/([a-z]{2})'\)/g)].map(([, locale]) => locale),
  ].filter(Boolean);
  const chatbotCatalogs = Object.fromEntries(registeredChatbotLocales.map(locale => [
    locale, objectBody(read(`${chatbot}/chatbot/locales/${locale}.ts`), 'catalog'),
  ]));
  const catalogSection = section => Object.fromEntries(Object.entries(chatbotCatalogs).map(([locale, body]) => [
    locale, new RegExp(`^  ${section}: \\{\\n([\\s\\S]*?)^  \\},`, 'm').exec(body)?.[1] ?? '',
  ]));
  const catalog = catalogSection('translations');
  const renderer = catalogSection('rendererLabels');

  const widget = 'packages/widget/src';
  const contract = read(`${widget}/contract/locale.ts`);
  const widgetUnion = /\btype WidgetLocale = ([^;\n]+)/.exec(contract)?.[1] ?? '';
  const widgetLocales = [...widgetUnion.matchAll(/'([a-z]{2})'/g)].map(([, locale]) => locale);
  const titles = collect(objectBody(contract, 'WIDGET_TITLES'), /^  ([a-z]{2}): (.+),?$/gm);
  const panel = read(`${widget}/panel/strings.ts`);
  const panelLocales = /\bconst STRINGS: [^=]+ = \{ ([^}]+) \}/.exec(panel)?.[1].split(/,\s*/) ?? [];
  const panelCatalogs = Object.fromEntries(panelLocales.map(locale => [locale, objectBody(panel, locale)]));
  const maps = [
    ['newsletter', newsletter, newsletterLocales, 2],
    ['chatbot', catalog, chatbotLocales, 4],
    ['chatbot-renderers', renderer, chatbotLocales, 4],
    ['support-panel', panelCatalogs, widgetLocales, 2],
    ['support-title', titles, widgetLocales, 0],
  ];
  const problems = chatbotLocales.slice().sort().join(',') === acceptedChatbotLocales.sort().join(',')
    ? [] : ['chatbot config: supported locales differ'];
  return problems.concat(maps.flatMap(([name, entries, locales, indent]) => [
    ...(!entries.es?.trim() ? [`${name}: Spanish reference catalogue missing`] : []),
    ...localeMapProblems(name, entries, [...new Set([...locales, ...REQUIRED_LOCALES])], indent ? keysAt(entries.es ?? '', indent) : undefined, indent),
  ]));
}
