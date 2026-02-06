/**
 * NestedFieldsHandler - MongoDB Integration Utilities
 *
 * Handles transformation between flat notation (billingAddress.street)
 * and nested objects ({ billingAddress: { street: "..." } })
 *
 * Features:
 * - Flatten nested objects to dot notation
 * - Unflatten dot notation to nested objects
 * - Group fields by prefix
 * - Validate nested structures
 */

export interface FieldConfiguration {
  fieldName: string;
  displayName: string;
  type: string;
  required?: boolean;
}

export class NestedFieldsHandler {
  /**
   * Flatten nested object to dot notation
   *
   * @example
   * flatten({ billing: { street: "Main St", city: "NY" } })
   * // => { "billing.street": "Main St", "billing.city": "NY" }
   */
  static flatten(obj: any, prefix: string = ''): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects
        Object.assign(flattened, this.flatten(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }

  /**
   * Unflatten dot notation to nested object
   *
   * @example
   * unflatten({ "billing.street": "Main St", "billing.city": "NY" })
   * // => { billing: { street: "Main St", city: "NY" } }
   */
  static unflatten(flattened: Record<string, any>): any {
    const result: any = {};

    for (const key in flattened) {
      if (!Object.prototype.hasOwnProperty.call(flattened, key)) continue;

      const keys = key.split('.');
      let current: any = result;

      for (let i = 0; i < keys.length; i++) {
        const part = keys[i] as string;

        if (i === keys.length - 1) {
          // Last key - assign value
          current[part] = flattened[key];
        } else {
          // Intermediate key - create object if doesn't exist
          if (!current[part] || typeof current[part] !== 'object') {
            current[part] = {};
          }
          current = current[part];
        }
      }
    }

    return result;
  }

  /**
   * Group field configurations by their nested prefix
   *
   * @example
   * groupNestedFields([
   *   { fieldName: "email", ... },
   *   { fieldName: "billing.street", ... },
   *   { fieldName: "billing.city", ... }
   * ])
   * // => Map {
   * //   "" => [{ fieldName: "email", ... }],
   * //   "billing" => [{ fieldName: "billing.street", ... }, { fieldName: "billing.city", ... }]
   * // }
   */
  static groupNestedFields(fields: FieldConfiguration[]): Map<string, FieldConfiguration[]> {
    const groups = new Map<string, FieldConfiguration[]>();

    for (const field of fields) {
      const dotIndex = field.fieldName.indexOf('.');
      const prefix = dotIndex > 0 ? field.fieldName.substring(0, dotIndex) : '';

      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }

      const group = groups.get(prefix);
      if (group) {
        group.push(field);
      }
    }

    return groups;
  }

  /**
   * Extract nested path from field name
   *
   * @example
   * getNestedPath("billing.address.street") => ["billing", "address", "street"]
   */
  static getNestedPath(fieldName: string): string[] {
    return fieldName.split('.');
  }

  /**
   * Get nested value from object using dot notation
   *
   * @example
   * getNestedValue({ billing: { street: "Main St" } }, "billing.street")
   * // => "Main St"
   */
  static getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Set nested value in object using dot notation
   *
   * @example
   * const obj = {};
   * setNestedValue(obj, "billing.street", "Main St");
   * // obj is now { billing: { street: "Main St" } }
   */
  static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current: any = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i] as string;

      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }

      current = current[key];
    }

    const lastKey = keys[keys.length - 1] as string;
    current[lastKey] = value;
  }

  /**
   * Check if field name contains nested notation
   */
  static isNestedField(fieldName: string): boolean {
    return fieldName.includes('.');
  }

  /**
   * Get root field name from nested path
   *
   * @example
   * getRootFieldName("billing.address.street") => "billing"
   */
  static getRootFieldName(fieldName: string): string {
    const dotIndex = fieldName.indexOf('.');
    return dotIndex > 0 ? fieldName.substring(0, dotIndex) : fieldName;
  }

  /**
   * Get leaf field name from nested path
   *
   * @example
   * getLeafFieldName("billing.address.street") => "street"
   */
  static getLeafFieldName(fieldName: string): string {
    const parts = fieldName.split('.');
    return parts[parts.length - 1] as string;
  }

  /**
   * Validate nested structure
   * Checks that all nested fields under a prefix are present
   */
  static validateNestedStructure(
    data: Record<string, any>,
    requiredFields: string[]
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const field of requiredFields) {
      const value = this.getNestedValue(data, field);

      if (value === null || value === undefined || value === '') {
        missing.push(field);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Convert FormData to nested object
   * Useful for form submission
   */
  static formDataToNestedObject(formData: FormData): any {
    const flattened: Record<string, any> = {};

    formData.forEach((value, key) => {
      flattened[key] = value;
    });

    return this.unflatten(flattened);
  }

  /**
   * Merge nested objects
   * Useful for updating partial nested data
   */
  static mergeNested(target: any, source: any): any {
    const flatTarget = this.flatten(target);
    const flatSource = this.flatten(source);

    const merged = { ...flatTarget, ...flatSource };

    return this.unflatten(merged);
  }
}
