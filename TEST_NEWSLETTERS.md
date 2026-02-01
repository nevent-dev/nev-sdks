# Test Newsletter Configurations

Este archivo documenta las newsletters de prueba creadas en MongoDB para testing del SDK.

## Base de Datos

- **Database**: `nevent`
- **Collection**: `newsletters`
- **Tenant ID**: `68383f4e0532b0378dcf7791` (tenant real de testing)

## Newsletters Creadas

### 1. SDK Test - Minimalista

**ID**: `697f9be729f8891a5cd890bb`

**Descripción**: Newsletter minimalista para testing del SDK - Solo email

**Características**:
- ✅ Solo campo email requerido
- 🎨 Tema: Light Blue (#3b82f6)
- 📝 Font: Inter (Google Fonts)
- 🎯 Campos habilitados: email únicamente

**Estilos**:
```json
{
  "backgroundColor": "#ffffff",
  "primaryColor": "#3b82f6",
  "font": "Inter",
  "borderRadius": "8px",
  "innerPadding": "32px"
}
```

**Uso en SDK**:
```javascript
const widget = new NeventSubscriptions.NewsletterWidget({
  newsletterId: '697f9be729f8891a5cd890bb',
  tenantId: '68383f4e0532b0378dcf7791',
  apiUrl: 'https://api.nevent.es',
  containerId: 'my-container',
});
await widget.init();
```

**Preview URL**:
```
https://api.nevent.es/public/widget/697f9be729f8891a5cd890bb/config?tenantId=68383f4e0532b0378dcf7791
```

---

### 2. SDK Test - Moderna Vibrante

**ID**: `697f9be729f8891a5cd890bc`

**Descripción**: Newsletter con colores vibrantes y todos los campos para testing completo

**Características**:
- ✅ Todos los campos habilitados (email, firstName, lastName, phone, birthDate, gender, postalCode)
- 🎨 Tema: Yellow/Amber (#f59e0b sobre #fef3c7)
- 📝 Font: Poppins (Google Fonts)
- 🎯 Campos requeridos: email, firstName, lastName
- ⚠️ Require marketing consent: true

**Estilos**:
```json
{
  "backgroundColor": "#fef3c7",
  "primaryColor": "#f59e0b",
  "font": "Poppins",
  "borderRadius": "12px",
  "innerPadding": "40px",
  "borderWidth": "2px",
  "borderColor": "#fbbf24"
}
```

**Uso en SDK**:
```javascript
const widget = new NeventSubscriptions.NewsletterWidget({
  newsletterId: '697f9be729f8891a5cd890bc',
  tenantId: '68383f4e0532b0378dcf7791',
  apiUrl: 'https://api.nevent.es',
  containerId: 'my-container',
});
await widget.init();
```

**Preview URL**:
```
https://api.nevent.es/public/widget/697f9be729f8891a5cd890bc/config?tenantId=68383f4e0532b0378dcf7791
```

---

### 3. SDK Test - Elegante Oscura

**ID**: `697f9be729f8891a5cd890bd`

**Descripción**: Newsletter con tema oscuro elegante y campos intermedios

**Características**:
- ✅ Campos habilitados: email, firstName, lastName, birthDate, postalCode
- 🎨 Tema: Dark (#1f2937 con acentos verde #10b981)
- 📝 Font: Playfair Display (títulos) + Inter (inputs)
- 🎯 Campos requeridos: email, firstName
- 🌙 Dark mode friendly

**Estilos**:
```json
{
  "backgroundColor": "#1f2937",
  "primaryColor": "#10b981",
  "titleFont": "Playfair Display",
  "inputFont": "Inter",
  "borderRadius": "6px",
  "innerPadding": "48px",
  "textColor": "#f9fafb",
  "inputBackgroundColor": "#374151"
}
```

**Uso en SDK**:
```javascript
const widget = new NeventSubscriptions.NewsletterWidget({
  newsletterId: '697f9be729f8891a5cd890bd',
  tenantId: '68383f4e0532b0378dcf7791',
  apiUrl: 'https://api.nevent.es',
  containerId: 'my-container',
});
await widget.init();
```

**Preview URL**:
```
https://api.nevent.es/public/widget/697f9be729f8891a5cd890bd/config?tenantId=68383f4e0532b0378dcf7791
```

---

## Verificación en MongoDB

Para verificar que las newsletters existen:

```javascript
mongosh nevent --eval 'db.newsletters.find({tenantId: "68383f4e0532b0378dcf7791"}).pretty()'
```

O usando el agregador:

```javascript
mongosh nevent --eval '
  db.newsletters.aggregate([
    { $match: { tenantId: "68383f4e0532b0378dcf7791" } },
    {
      $project: {
        _id: 1,
        name: 1,
        "fields.email.enabled": 1,
        "fields.firstName.enabled": 1,
        "settings.widgetStyles.global.backgroundColor": 1,
        "settings.widgetStyles.button.backgroundColor": 1
      }
    }
  ]).pretty()
'
```

## Testing

### Test Page 1: Básico
```
file:///Users/samu/workspace/nevent/nev-sdks/examples/test-cdn.html
```

Usa configuraciones hardcodeadas en JavaScript.

### Test Page 2: Con Base de Datos (RECOMENDADO)
```
file:///Users/samu/workspace/nevent/nev-sdks/examples/test-cdn-with-db.html
```

Carga las configuraciones reales desde MongoDB usando los IDs listados arriba.

**Ventajas**:
- ✅ Prueba el flujo completo de carga de configuración
- ✅ Verifica que el API endpoint funciona correctamente
- ✅ Valida que los estilos se aplican correctamente desde la DB
- ✅ Testing realista del comportamiento en producción

## Limpieza

Para eliminar las newsletters de prueba:

```javascript
mongosh nevent --eval 'db.newsletters.deleteMany({tenantId: "68383f4e0532b0378dcf7791"})'
```

## Notas

- Todas las newsletters usan `requirePrivacyConsent: true` para cumplir con GDPR
- Las newsletters están marcadas como `active: true`
- El widget analytics está habilitado en todas
- Rate limits configurados: 100/hora, 500/día
- No requieren confirmación de email (`requireEmailConfirmation: false`)

## Troubleshooting

### No se carga la configuración desde DB

1. Verificar que el endpoint del API está correcto:
   ```
   https://api.nevent.es/public/widget/{newsletterId}/config?tenantId={tenantId}
   ```

2. Verificar que las newsletters existen en MongoDB

3. Verificar CORS en el API (debe permitir `*` para widgets públicos)

4. Revisar la consola del navegador para errores de red

### Los estilos no se aplican

1. Verificar que Google Fonts está cargando correctamente
2. Verificar que `widgetStyles` está en la respuesta del API
3. Comprobar que no hay CSS que sobreescriba los estilos del widget
