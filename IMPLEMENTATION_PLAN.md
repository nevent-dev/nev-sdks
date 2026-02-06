# Implementation Plan: NEV-1324 + NEV-1325 → Enterprise Forms System

**Created:** 2026-02-06
**Status:** Planning
**Total Story Points:** 45 (FASE 1: 21 pts + FASE 2: 24 pts)

---

## 📊 EXECUTIVE SUMMARY

Implementación incremental de sistema de formularios dinámicos enterprise-grade para SDK de newsletters, comparable a Stripe Elements.

**Enfoque:** Dividir en 2 fases
- **FASE 1 (NEV-1324 + NEV-1325):** Base funcional - campos dinámicos desde API
- **FASE 2 (NEV-1326 a NEV-1330):** Extensiones enterprise - CSS variables, componentes custom, validaciones avanzadas

---

## 🎯 FASE 1: IMPLEMENTACIÓN BASE (2-3 días)

### NEV-1324: SDK Widget Consume fieldConfigurations API (8 pts)

**Jira:** https://nevent-dev.atlassian.net/browse/NEV-1324

**Objetivo:**
Widget consume dinámicamente campos desde API en lugar de tenerlos hardcodeados.

**Acceptance Criteria:**

1. Widget consume `/public/widget/{id}/config` que retorna:
```json
{
  "fieldConfigurations": [
    {
      "fieldName": "email",
      "displayName": "Email Address",
      "hint": "We'll never share your email",
      "required": true,
      "type": "email"
    },
    {
      "fieldName": "firstName",
      "displayName": "First Name",
      "hint": null,
      "required": true,
      "type": "text"
    }
  ]
}
```

2. Widget renderiza campos dinámicamente según `fieldConfigurations`
3. Usa `displayName` como label del campo
4. Muestra `hint` como texto de ayuda (si existe)
5. Aplica validación según `required` y `type`
6. Mantiene backward compatibility si API no retorna `fieldConfigurations`

**Archivos a modificar:**
- `packages/subscriptions/src/newsletter/types.ts`
- `packages/subscriptions/src/newsletter/form-renderer.ts`
- `packages/subscriptions/src/newsletter-widget.ts`
- `test.html`

**Tests a crear:**
- `packages/subscriptions/src/newsletter/__tests__/form-renderer.test.ts`

---

### NEV-1325: Frontend Editor de Campos (13 pts)

**Jira:** https://nevent-dev.atlassian.net/browse/NEV-1325

**Objetivo:**
Editor visual en nev-admin-web para que admins configuren campos de cada newsletter.

**Acceptance Criteria:**

1. Página en nev-admin-web: `/settings/newsletters/{id}/fields`
2. Lista de campos disponibles con drag-and-drop (PrimeNG p-orderList)
3. Toggle para marcar campos como required
4. Input para editar `displayName` y `hint`
5. Preview en tiempo real del formulario
6. Botón "Save" que actualiza configuración vía API
7. Validación: al menos 1 campo debe ser email

**Repositorio:** `nev-admin-web` (NO nev-sdks)

**Archivos a crear:**
- `src/app/features/newsletters/components/field-config-editor/field-config-editor.component.ts`
- `src/app/features/newsletters/components/field-config-editor/field-config-editor.component.html`
- `src/app/features/newsletters/components/field-config-editor/field-config-editor.component.scss`

---

## 🚀 FASE 2: EXTENSIONES ENTERPRISE (3-4 semanas)

### Issues a Crear en Jira

#### NEV-1326: Sistema de CSS Variables (5 pts)
**Objetivo:** Refactorizar sistema de estilos a CSS custom properties

**Características:**
- Variables en `:root` para todos los valores dinámicos
- 30+ variables CSS disponibles
- Override sin `!important` (mejor DX)
- Theming dinámico (light/dark/custom)

**Archivos:**
- `src/newsletter/styles/StyleManager.ts` (nuevo)
- `src/newsletter-widget.ts` (refactorizar generateCSS)
- `src/newsletter/styles/variables.css` (nuevo)

**CSS Variables a implementar:**
```css
/* Colors */
--nev-primary-color: #007bff;
--nev-secondary-color: #6c757d;
--nev-success-color: #28a745;
--nev-error-color: #dc3545;

/* Typography */
--nev-font-family: system-ui, -apple-system, sans-serif;
--nev-font-size-base: 16px;
--nev-font-weight-normal: 400;
--nev-font-weight-bold: 600;

/* Spacing */
--nev-spacing-xs: 4px;
--nev-spacing-sm: 8px;
--nev-spacing-md: 16px;
--nev-spacing-lg: 24px;

/* Form Elements */
--nev-input-border-color: #ced4da;
--nev-input-border-radius: 4px;
--nev-input-padding: 8px 12px;
--nev-input-focus-border-color: #007bff;
--nev-input-error-border-color: #dc3545;

/* Buttons */
--nev-button-border-radius: 4px;
--nev-button-padding: 10px 20px;
--nev-button-hover-opacity: 0.9;
```

---

#### NEV-1327: Componentes Custom Enterprise (8 pts)
**Objetivo:** Componentes de alta calidad comparable a Stripe Elements

**Componentes a implementar:**

**1. DatePicker Component**
- Calendar desplegable con navegación mes/año
- Validación de rangos (min/max dates)
- Soporte i18n (locales)
- Accesibilidad (ARIA, keyboard navigation)
- Responsive design

**2. PhoneInput Component**
- Selector de país con banderas
- Validación por país (libphonenumber-js)
- Formato automático
- Detección automática de país
- Lista de países configurable

**3. FileUpload Component**
- Drag & drop support
- Preview de imágenes
- Validación de tamaño/tipo
- Progress indicator
- Crop/resize opcional (fase 2.1)

**Archivos a crear:**
- `src/newsletter/components/custom/DatePicker/DatePicker.ts`
- `src/newsletter/components/custom/DatePicker/DatePicker.css`
- `src/newsletter/components/custom/PhoneInput/PhoneInput.ts`
- `src/newsletter/components/custom/PhoneInput/PhoneInput.css`
- `src/newsletter/components/custom/FileUpload/FileUpload.ts`
- `src/newsletter/components/custom/FileUpload/FileUpload.css`

**Dependencias:**
```bash
npm install --save libphonenumber-js  # ~200KB
```

---

#### NEV-1328: Validaciones Avanzadas (5 pts)
**Objetivo:** Sistema robusto de validación síncrona y asíncrona

**Características:**
- Validador centralizado con reglas reutilizables
- Validaciones por tipo (email, URL, phone, number, date)
- Validaciones custom (funciones personalizadas)
- Validaciones asíncronas (server-side)
- Mensajes de error personalizables

**Archivos a crear:**
- `src/newsletter/validators/Validator.ts`
- `src/newsletter/validators/AsyncValidator.ts`
- `src/newsletter/validators/rules/EmailRule.ts`
- `src/newsletter/validators/rules/PhoneRule.ts`
- `src/newsletter/validators/rules/URLRule.ts`

**Interfaz:**
```typescript
export interface ValidationConfig {
  pattern?: RegExp | string;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  message?: string;
  custom?: (value: any) => boolean | string;
  async?: boolean;
  asyncValidator?: (value: any) => Promise<string | null>;
}

export class Validator {
  async validate(field: FieldConfig, value: any): Promise<ValidationResult>;
}
```

---

#### NEV-1329: Campos Anidados (3 pts)
**Objetivo:** Soporte para objetos anidados (MongoDB integration)

**Características:**
- Flat notation: `billingAddress.street` → render como campo separado
- Reconstrucción de objetos anidados en submit
- Validación de objetos completos
- Campos condicionales (mostrar si otro campo tiene valor X)

**Archivos a crear:**
- `src/newsletter/utils/nested-fields.ts`

**Utilidades:**
```typescript
export class NestedFieldsHandler {
  // { billingAddress: { street: "Main St" } } → { "billingAddress.street": "Main St" }
  static flatten(obj: any, prefix?: string): Record<string, any>;

  // { "billingAddress.street": "Main St" } → { billingAddress: { street: "Main St" } }
  static unflatten(flattened: Record<string, any>): any;

  // Agrupa campos anidados por prefijo
  static groupNestedFields(fields: FieldConfig[]): Map<string, FieldConfig[]>;
}
```

**Ejemplo de uso:**
```json
// API envía:
{
  "fieldConfigurations": [
    { "fieldName": "billingAddress.street", "type": "text", "label": "Street" },
    { "fieldName": "billingAddress.city", "type": "text", "label": "City" },
    { "fieldName": "billingAddress.country", "type": "select", "label": "Country" }
  ]
}

// SDK envía al submit:
{
  "billingAddress": {
    "street": "Main St",
    "city": "New York",
    "country": "US"
  }
}
```

---

#### NEV-1330: Performance Optimization (3 pts)
**Objetivo:** Bundle size <50KB gzipped

**Técnicas:**
- Tree-shaking de field types no usados
- Lazy loading de componentes custom
- Code splitting por componente
- Análisis de bundle size (webpack-bundle-analyzer)

**Archivos a modificar:**
- `webpack.config.js` (optimización)
- `package.json` (scripts de análisis)

**Scripts:**
```json
{
  "scripts": {
    "analyze": "webpack-bundle-analyzer dist/stats.json",
    "build:analyze": "webpack --profile --json > dist/stats.json"
  }
}
```

**Target:** ≤ 50KB gzipped para SDK completo

---

## 🏗️ ARQUITECTURA TÉCNICA

### Estructura de Archivos (Estado Final)

```
packages/subscriptions/
├── src/
│   ├── newsletter-widget.ts           # Widget principal
│   ├── newsletter/
│   │   ├── form-renderer.ts           # Renderer de formularios
│   │   ├── newsletter.ts              # Clase Newsletter
│   │   └── types/
│   │       ├── config.ts              # FormConfig, NewsletterConfig
│   │       ├── field.ts               # FieldConfig, FieldType
│   │       ├── validation.ts          # ValidationConfig
│   │       └── styles.ts              # FormStyles, FieldStyles
│   ├── fields/
│   │   ├── base/
│   │   │   └── BaseFieldRenderer.ts   # Clase abstracta base
│   │   ├── FieldFactory.ts            # Factory pattern
│   │   ├── InputFieldRenderer.ts      # text, email, tel, number, url
│   │   ├── SelectFieldRenderer.ts     # select
│   │   ├── CheckboxFieldRenderer.ts   # checkbox
│   │   ├── RadioFieldRenderer.ts      # radio
│   │   ├── TextareaFieldRenderer.ts   # textarea
│   │   ├── DateFieldRenderer.ts       # date (HTML5 nativo)
│   │   └── FileFieldRenderer.ts       # file
│   ├── components/
│   │   └── custom/
│   │       ├── DatePicker/            # DatePicker enterprise
│   │       │   ├── DatePicker.ts
│   │       │   └── DatePicker.css
│   │       ├── PhoneInput/            # PhoneInput con país
│   │       │   ├── PhoneInput.ts
│   │       │   └── PhoneInput.css
│   │       └── FileUpload/            # FileUpload drag-and-drop
│   │           ├── FileUpload.ts
│   │           └── FileUpload.css
│   ├── validators/
│   │   ├── Validator.ts               # Validador principal
│   │   ├── AsyncValidator.ts          # Validaciones async
│   │   └── rules/                     # Reglas individuales
│   │       ├── EmailRule.ts
│   │       ├── PhoneRule.ts
│   │       ├── URLRule.ts
│   │       └── DateRule.ts
│   ├── styles/
│   │   ├── StyleManager.ts            # Gestión de CSS variables
│   │   ├── variables.css              # CSS custom properties
│   │   └── themes/                    # Temas predefinidos
│   │       ├── light.css
│   │       └── dark.css
│   └── utils/
│       ├── validators.ts              # Validadores legacy
│       ├── dom.ts                     # Utilidades DOM
│       ├── nested-fields.ts           # Manejo campos anidados
│       └── sanitize.ts                # Sanitización CSS (anti-XSS)
├── docs/
│   ├── css-customization.md           # Guía de CSS variables
│   ├── custom-components.md           # Documentación componentes
│   ├── migration-guide.md             # Migración desde formOptions
│   └── api-integration.md             # Contrato de API
├── test.html                          # Página de prueba
└── __tests__/
    ├── unit/
    │   ├── fields/                    # Tests de renderers
    │   ├── validators/                # Tests de validaciones
    │   └── components/                # Tests de componentes custom
    └── integration/
        └── form.test.ts               # Tests E2E de formulario
```

---

## 🔧 INTERFACES TYPESCRIPT

### Core Types

```typescript
// field.ts
export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'url'
  | 'password'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'date'
  | 'time'
  | 'file';

export interface FieldConfiguration {
  fieldName: string;          // Nombre técnico del campo
  displayName: string;         // Label visible
  hint?: string | null;        // Texto de ayuda
  required: boolean;           // ¿Obligatorio?
  type: FieldType;            // Tipo de campo
  options?: FieldOption[];     // Para select/radio/checkbox
  validation?: ValidationConfig;
  styles?: FieldStyles;
  metadata?: Record<string, any>;
}

export interface FieldOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  selected?: boolean;  // Para select
  checked?: boolean;   // Para checkbox/radio
}

// validation.ts
export interface ValidationConfig {
  pattern?: RegExp | string;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  message?: string;
  custom?: (value: any) => boolean | string;
  async?: boolean;
  asyncValidator?: (value: any) => Promise<string | null>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// config.ts
export interface FormConfig {
  fields: FieldConfiguration[];
  submitButton?: {
    text?: string;
    disabled?: boolean;
    styles?: Record<string, any>;
  };
  onSubmit?: (data: FormData) => Promise<void>;
  onSuccess?: (response: any) => void;
  onError?: (error: any) => void;
  styles?: FormStyles;
}

// styles.ts
export interface FormStyles {
  theme?: 'light' | 'dark' | 'custom';
  customCSS?: Record<string, string>;  // CSS variables
  globalStyles?: string;                // Raw CSS string
  fieldStyles?: Record<string, FieldStyles>;
}

export interface FieldStyles {
  container?: CSSProperties;
  label?: CSSProperties;
  input?: CSSProperties;
  error?: CSSProperties;
}
```

### BaseFieldRenderer Pattern

```typescript
// base/BaseFieldRenderer.ts
export abstract class BaseFieldRenderer {
  constructor(protected config: FieldConfiguration) {}

  abstract render(): HTMLElement;

  validate(): ValidationResult {
    const errors: string[] = [];
    const value = this.getValue();

    // Required validation
    if (this.config.required && !value) {
      errors.push(`${this.config.displayName} is required`);
    }

    // Custom validations (override en subclases)
    const customErrors = this.validateCustom(value);
    errors.push(...customErrors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected validateCustom(value: any): string[] {
    // Override en subclases
    return [];
  }

  protected abstract getValue(): any;

  protected createLabel(): HTMLLabelElement {
    const label = document.createElement('label');
    label.textContent = this.config.displayName;
    if (this.config.required) {
      label.innerHTML += ' <span class="required">*</span>';
    }
    this.applyStyles(label, this.config.styles?.label);
    return label;
  }

  protected createError(message: string): HTMLSpanElement {
    const error = document.createElement('span');
    error.className = 'nevent-field-error';
    error.textContent = message;
    this.applyStyles(error, this.config.styles?.error);
    return error;
  }

  protected applyStyles(element: HTMLElement, styles?: Record<string, any>): void {
    if (!styles) return;
    Object.assign(element.style, styles);
  }
}
```

---

## 📝 GIT WORKFLOW

### Branch Strategy

```bash
# FASE 1
git checkout development
git pull origin development
git checkout -b feat/NEV-1324-1325-dynamic-fields-base

# FASE 2 (después)
git checkout -b feat/NEV-1326-css-variables
git checkout -b feat/NEV-1327-custom-components
# etc.
```

### Commit Convention

**Formato:**
```
<type>(<scope>): <short description>

<detailed description in bullet points>

Refs: NEV-XXXX
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

**Ejemplos FASE 1:**

```
feat(sdk): add support for fieldConfigurations API

- Add FieldConfiguration interface
- Update ServerWidgetConfig to include fieldConfigurations
- Add backward compatibility fallback to default email field

Refs: NEV-1324
```

```
feat(sdk): dynamic form rendering from API config

- Modify FormRenderer to consume fieldConfigurations
- Render fields dynamically with displayName and hint
- Apply required validation based on API config
- Support text, email, tel, number, date, textarea types

Refs: NEV-1324
```

```
feat(admin): add field configuration editor

- Create FieldConfigEditorComponent with drag-and-drop
- Implement inline editing of displayName and hint
- Add preview panel with live updates
- Connect to API for save/load

Refs: NEV-1325
```

**Ejemplos FASE 2:**

```
feat(sdk): refactor CSS to use CSS variables

- Replace inline styles with CSS custom properties
- Add 30+ CSS variables for deep customization
- Enable override without !important
- Create StyleManager for centralized management

Refs: NEV-1326
```

```
feat(sdk): add enterprise DatePicker component

- Calendar with month/year navigation
- Min/max date validation
- i18n support (multiple locales)
- ARIA labels and keyboard navigation
- Responsive design

Refs: NEV-1327
```

---

## 🧪 TESTING STRATEGY

### Unit Tests (95% coverage target)

**Archivos de test:**
```
__tests__/
├── unit/
│   ├── fields/
│   │   ├── InputFieldRenderer.test.ts
│   │   ├── SelectFieldRenderer.test.ts
│   │   ├── CheckboxFieldRenderer.test.ts
│   │   └── ...
│   ├── validators/
│   │   ├── Validator.test.ts
│   │   ├── AsyncValidator.test.ts
│   │   └── ...
│   └── components/
│       ├── DatePicker.test.ts
│       ├── PhoneInput.test.ts
│       └── FileUpload.test.ts
└── integration/
    └── form.test.ts
```

**Ejemplo de test:**

```typescript
// InputFieldRenderer.test.ts
import { InputFieldRenderer } from '../fields/InputFieldRenderer';

describe('InputFieldRenderer', () => {
  it('should render text input', () => {
    const renderer = new InputFieldRenderer({
      fieldName: 'firstName',
      displayName: 'First Name',
      hint: null,
      required: true,
      type: 'text'
    });

    const element = renderer.render();

    expect(element.querySelector('input[type="text"]')).toBeTruthy();
    expect(element.querySelector('label')?.textContent).toContain('First Name');
  });

  it('should validate required field', () => {
    const renderer = new InputFieldRenderer({
      fieldName: 'email',
      displayName: 'Email',
      hint: null,
      required: true,
      type: 'email'
    });

    const result = renderer.validate();

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email is required');
  });

  it('should validate email format', () => {
    const renderer = new InputFieldRenderer({
      fieldName: 'email',
      displayName: 'Email',
      hint: null,
      required: false,
      type: 'email'
    });

    // Mock input value
    renderer['input'] = { value: 'invalid-email' } as any;

    const result = renderer.validate();

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Please enter a valid email address');
  });

  it('should display hint text when provided', () => {
    const renderer = new InputFieldRenderer({
      fieldName: 'email',
      displayName: 'Email',
      hint: 'We will never share your email',
      required: true,
      type: 'email'
    });

    const element = renderer.render();

    const hint = element.querySelector('.nevent-field-hint');
    expect(hint?.textContent).toBe('We will never share your email');
  });
});
```

### Integration Tests

```typescript
// form.test.ts
describe('Full Form Integration', () => {
  it('should render complete form from API config', async () => {
    const config = {
      fieldConfigurations: [
        { fieldName: 'email', displayName: 'Email', required: true, type: 'email' },
        { fieldName: 'firstName', displayName: 'First Name', required: true, type: 'text' },
        { fieldName: 'phone', displayName: 'Phone', required: false, type: 'tel' }
      ]
    };

    const container = document.createElement('div');
    const renderer = new FormRenderer(config);
    renderer.render(container);

    expect(container.querySelectorAll('.nevent-field').length).toBe(3);
    expect(container.querySelector('button[type="submit"]')).toBeTruthy();
  });

  it('should validate all fields on submit', async () => {
    // Test completo de validación
  });

  it('should submit form data correctly', async () => {
    // Test de submit a API
  });
});
```

---

## 📚 DOCUMENTACIÓN A CREAR

### docs/css-customization.md

```markdown
# CSS Customization Guide

## Overview
The Nevent Newsletter SDK uses CSS custom properties (variables) to allow deep customization of form styles without writing complex CSS.

## CSS Variables Reference

### Colors
- `--nev-primary-color`: Main brand color (default: #007bff)
- `--nev-secondary-color`: Secondary color (default: #6c757d)
- `--nev-success-color`: Success state (default: #28a745)
- `--nev-error-color`: Error state (default: #dc3545)

[... continuar con todas las variables ...]

## Basic Customization

```typescript
const widget = new NewsletterWidget({
  apiKey: 'your-key',
  styles: {
    customCSS: {
      '--nev-primary-color': '#ff6b6b',
      '--nev-font-family': 'Inter, sans-serif'
    }
  }
});
```

## Advanced Customization

Override with standard CSS:

```html
<style>
  :root {
    --nev-primary-color: #667eea;
    --nev-input-border-radius: 12px;
  }

  .nevent-submit-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
</style>
```

[... ejemplos de temas dark, glassmorphism, etc ...]
```

### docs/migration-guide.md

```markdown
# Migration Guide: formOptions → fieldConfigurations

## Overview
This guide helps you migrate from the deprecated `formOptions` configuration to the new `fieldConfigurations` system.

## Old Format (Deprecated)

```typescript
const widget = new NewsletterWidget({
  newsletter: {
    formOptions: {
      email: true,
      firstName: true,
      lastName: false
    }
  }
});
```

## New Format

```typescript
const widget = new NewsletterWidget({
  newsletter: {
    form: {
      fields: [
        {
          fieldName: 'email',
          displayName: 'Email Address',
          hint: 'We will never share your email',
          required: true,
          type: 'email'
        },
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          required: true,
          type: 'text'
        }
      ]
    }
  }
});
```

[... continuar con ejemplos completos ...]
```

### docs/api-integration.md

```markdown
# API Integration Guide

## Endpoints

### GET `/public/widget/{id}/config`

Returns widget configuration including field definitions.

**Response:**
```json
{
  "fieldConfigurations": [
    {
      "fieldName": "email",
      "displayName": "Email Address",
      "hint": "We'll never share your email",
      "required": true,
      "type": "email"
    }
  ],
  "styles": {
    "global": {
      "backgroundColor": "#ffffff"
    }
  }
}
```

### POST `/api/newsletter/subscribe`

Submit form data.

**Request:**
```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "customFields": {
    "country": "ES"
  }
}
```

[... continuar con todos los endpoints ...]
```

---

## 🎯 DEFINITION OF DONE

### FASE 1 (NEV-1324 + NEV-1325)

**NEV-1324 (SDK):**
- [ ] FieldConfiguration interface implementada
- [ ] FormRenderer consume fieldConfigurations
- [ ] Campos renderizados dinámicamente con displayName y hint
- [ ] Validación required y por type funcionando
- [ ] Backward compatibility con email por defecto
- [ ] 4+ tests unitarios escritos y pasando
- [ ] test.html actualizado con ejemplos
- [ ] Sin errores TypeScript

**NEV-1325 (Admin):**
- [ ] FieldConfigEditorComponent creado en nev-admin-web
- [ ] Drag-and-drop funcional (PrimeNG p-orderList)
- [ ] Inline editing de displayName y hint
- [ ] Toggle de required
- [ ] Preview en tiempo real del formulario
- [ ] Save/Load desde API funcionando
- [ ] Validación de al menos 1 campo email
- [ ] Tests de componente Angular

**General:**
- [ ] Code review interno completado
- [ ] Commits con formato convencional
- [ ] PRs creados (uno por repo)
- [ ] Screenshots en PRs
- [ ] Sin warnings de build

### FASE 2 (NEV-1326 a NEV-1330)

**NEV-1326 (CSS Variables):**
- [ ] StyleManager implementado
- [ ] 30+ CSS variables definidas
- [ ] generateCSS() refactorizado
- [ ] Documentación de variables completa
- [ ] Ejemplos de override sin !important

**NEV-1327 (Componentes Custom):**
- [ ] DatePicker: calendar, navegación, i18n, ARIA
- [ ] PhoneInput: países, validación, formato
- [ ] FileUpload: drag-and-drop, preview, validación
- [ ] Todos los componentes con tests
- [ ] Calidad comparable a Stripe Elements

**NEV-1328 (Validaciones):**
- [ ] Validator class con sync + async
- [ ] Reglas por tipo (email, URL, phone, date)
- [ ] Custom validation functions
- [ ] AsyncValidator para server-side
- [ ] 10+ tests de validación

**NEV-1329 (Campos Anidados):**
- [ ] NestedFieldsHandler con flatten/unflatten
- [ ] Soporte para billingAddress.street notation
- [ ] Reconstrucción de objetos en submit
- [ ] Tests de transformación

**NEV-1330 (Performance):**
- [ ] Bundle size ≤ 50KB gzipped
- [ ] Tree-shaking funcional
- [ ] Lazy loading de componentes custom
- [ ] webpack-bundle-analyzer configurado
- [ ] Reporte de performance

---

## 📊 ESTIMACIONES

| Issue | Story Points | Días Estimados | Complejidad |
|-------|--------------|----------------|-------------|
| NEV-1324 | 8 | 1.5 | Media |
| NEV-1325 | 13 | 2 | Media-Alta |
| **FASE 1 Total** | **21** | **2-3** | **Media** |
| NEV-1326 | 5 | 2 | Media |
| NEV-1327 | 8 | 5 | Alta |
| NEV-1328 | 5 | 3 | Media |
| NEV-1329 | 3 | 2 | Baja |
| NEV-1330 | 3 | 2 | Media |
| **FASE 2 Total** | **24** | **14** | **Alta** |
| **TOTAL** | **45** | **16-17** | **3-4 semanas** |

---

## 🚨 RIESGOS Y MITIGACIONES

### FASE 1

**Riesgo:** API no lista con endpoint `/public/widget/{id}/config`
**Mitigación:** Usar mocks en test.html, coordinar con backend

**Riesgo:** Backward compatibility rompe funcionalidad existente
**Mitigación:** Tests de regresión, fallback robusto a email por defecto

**Riesgo:** nev-admin-web tiene dependencias desactualizadas
**Mitigación:** Verificar versión de PrimeNG, actualizar si necesario

### FASE 2

**Riesgo:** Bundle size >50KB con todos los componentes custom
**Mitigación:** Lazy loading agresivo, tree-shaking, análisis continuo

**Riesgo:** libphonenumber-js demasiado pesado (~200KB)
**Mitigación:** Evaluar alternativas más ligeras, considerar build custom

**Riesgo:** Componentes custom no accesibles (ARIA)
**Mitigación:** Auditoría de accesibilidad, tests con lectores de pantalla

---

## 📞 CONTACTOS Y RECURSOS

**Jira:**
- NEV-1324: https://nevent-dev.atlassian.net/browse/NEV-1324
- NEV-1325: https://nevent-dev.atlassian.net/browse/NEV-1325

**Confluence:**
- Integration Guide: https://nevent-dev.atlassian.net/wiki/spaces/IT/pages/271581185

**Repositorios:**
- nev-sdks: `/Users/samu/workspace/nevent/nev-sdks`
- nev-admin-web: `/Users/samu/workspace/nevent/nev-admin-web`
- nev-api: `/Users/samu/workspace/nevent/nev-api`

**Benchmarks:**
- Stripe Elements: https://stripe.com/docs/stripe-js
- Stripe Elements API: https://stripe.com/docs/js/element

**Librerías:**
- libphonenumber-js: https://www.npmjs.com/package/libphonenumber-js
- PrimeNG: https://primeng.org/ (nev-admin-web usa PrimeNG 17+)

---

## 🔄 WORKFLOW DE APROBACIÓN

### FASE 1

1. Agente implementa NEV-1324 + NEV-1325
2. Agente reporta: archivos modificados, commits preparados, tests
3. Usuario revisa implementación
4. Usuario aprueba push
5. Agente crea PRs (uno por repo)
6. Code review por equipo
7. Merge a development
8. Deploy a staging para QA

### FASE 2

1. Usuario aprueba inicio de FASE 2
2. Crear issues NEV-1326 a NEV-1330 en Jira
3. Implementar cada issue en branch separado
4. PRs incrementales (uno por issue)
5. Review y merge iterativo
6. Final: Release con todas las features FASE 2

---

## 📋 CHECKLIST PRE-IMPLEMENTACIÓN

**Antes de empezar FASE 1:**
- [x] Issues NEV-1324 y NEV-1325 revisados en Jira
- [x] Confluence integration guide leído
- [x] Plan documentado en IMPLEMENTATION_PLAN.md
- [x] TODOs creados en todo list
- [ ] Rama development actualizada (`git pull`)
- [ ] Dependencias instaladas (`npm install`)
- [ ] Tests actuales pasando (`npm test`)
- [ ] Build funcionando (`npm run build`)

**Antes de empezar FASE 2:**
- [ ] FASE 1 completada y merged
- [ ] Issues NEV-1326 a NEV-1330 creados en Jira
- [ ] Estimaciones revisadas y aprobadas
- [ ] Recursos (tiempo, equipo) asignados
- [ ] Dependencias externas instaladas (libphonenumber-js)

---

## 🎯 SUCCESS METRICS

### FASE 1
- ✅ Widget consume API y renderiza campos dinámicamente
- ✅ Editor admin funcional con drag-and-drop
- ✅ Backward compatibility 100%
- ✅ Zero breaking changes
- ✅ Tests passing (>80% coverage)

### FASE 2
- ✅ Bundle size <50KB gzipped
- ✅ 3 componentes custom funcionales
- ✅ CSS variables sin !important
- ✅ Validaciones síncronas + asíncronas
- ✅ Campos anidados soportados
- ✅ Calidad comparable a Stripe Elements
- ✅ Tests passing (>95% coverage)

### Post-Launch
- 📈 Adoption rate: 80%+ de clientes migrados en 3 meses
- 📈 Support tickets: <5% relacionados con formularios
- 📈 Performance: <100ms render time para formularios de 10 campos
- 📈 Developer satisfaction: NPS >8/10

---

## 📝 NOTAS ADICIONALES

### Decisiones Técnicas

**¿Por qué no usar librerías de formularios (Formik, React Hook Form)?**
- SDK debe ser framework-agnostic (vanilla JS/TS)
- Evitar dependencias pesadas
- Control total sobre renderizado y performance

**¿Por qué CSS variables en lugar de CSS-in-JS?**
- Mejor performance (no requiere JavaScript para estilos)
- DX más familiar para promotores (CSS estándar)
- Override más simple (sin !important)

**¿Por qué componentes custom en lugar de inputs nativos?**
- UX superior (comparable a Stripe Elements)
- Consistencia cross-browser
- Funcionalidad avanzada (phone validation, calendar)

### Aprendizajes de Proyectos Similares

**De Stripe Elements:**
- CSS variables para theming
- Componentes custom pero ligeros
- API minimalista y clara
- Documentación excelente

**De Shopify Polaris:**
- Guías de accesibilidad robustas
- Componentes enterprise-grade
- Sistema de tokens de diseño

**De Material UI:**
- TypeScript strict mode
- Tests exhaustivos
- Storybook para componentes

---

**Última actualización:** 2026-02-06
**Autor:** Claude Code (Orchestrator)
**Estado:** Documentación completa - Ready para implementación
