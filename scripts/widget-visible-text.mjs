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
