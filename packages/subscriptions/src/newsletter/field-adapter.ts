import type {
  ApiDataType,
  ApiFieldConfiguration,
  FieldConfiguration,
  FieldOption,
  FieldType,
} from '../types';

/**
 * Adapts raw API field configurations to internal SDK format.
 * Filters disabled fields, sorts by displayOrder, and maps types.
 *
 * @param apiFields - Raw field configurations from backend API
 * @returns Adapted field configurations for FormRenderer
 */
export function adaptFieldConfigurations(
  apiFields: ApiFieldConfiguration[]
): FieldConfiguration[] {
  return apiFields
    .filter((f) => f.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((f) => {
      const adapted: FieldConfiguration = {
        fieldName: f.semanticKey || f.propertyDefinitionId,
        propertyDefinitionId: f.propertyDefinitionId,
        displayName: f.displayName || f.propertyDefinitionId,
        hint: f.hint,
        required: f.required,
        type: mapDataType(f.dataType),
        displayOrder: f.displayOrder,
      };

      const options = adaptOptions(f.options);
      if (options) {
        adapted.options = options;
      }
      if (f.placeholder) {
        adapted.placeholder = f.placeholder;
      }
      if (f.width != null) {
        adapted.width = f.width;
      }

      return adapted;
    });
}

function mapDataType(dataType: ApiDataType): FieldType {
  const map: Record<ApiDataType, FieldType> = {
    TEXT: 'text',
    NUMBER: 'number',
    DATE: 'date',
    BOOLEAN: 'checkbox',
    SELECT: 'select',
    LIST: 'list',
  };
  return map[dataType] || 'text';
}

function adaptOptions(
  options?: Array<{ value: string; label: string } | string> | null
): FieldOption[] | undefined {
  if (!options || options.length === 0) return undefined;
  return options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return { value: opt.value, label: opt.label };
  });
}
