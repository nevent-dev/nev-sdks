import { describe, it, expect } from 'vitest';
import { adaptFieldConfigurations } from '../field-adapter';
import type { ApiFieldConfiguration } from '../../types';

describe('adaptFieldConfigurations', () => {
  it('should filter out disabled fields', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'name',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
      {
        propertyDefinitionId: 'hidden_field',
        enabled: false,
        required: false,
        displayOrder: 2,
        displayName: 'Hidden',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result).toHaveLength(1);
    expect(result[0]!.fieldName).toBe('name');
  });

  it('should sort fields by displayOrder', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'last_name',
        enabled: true,
        required: false,
        displayOrder: 3,
        displayName: 'Last Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
      {
        propertyDefinitionId: 'email',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Email',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
      {
        propertyDefinitionId: 'first_name',
        enabled: true,
        required: true,
        displayOrder: 2,
        displayName: 'First Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('email');
    expect(result[1]!.fieldName).toBe('first_name');
    expect(result[2]!.fieldName).toBe('last_name');
  });

  it('should map TEXT dataType to text FieldType', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'name',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Name',
        hint: null,
        placeholder: 'Enter name',
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.type).toBe('text');
  });

  it('should map NUMBER dataType to number FieldType', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'age',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Age',
        hint: null,
        placeholder: null,
        dataType: 'NUMBER',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.type).toBe('number');
  });

  it('should map DATE dataType to date FieldType', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'birth_date',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Birth Date',
        hint: null,
        placeholder: null,
        dataType: 'DATE',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.type).toBe('date');
  });

  it('should map BOOLEAN dataType to checkbox FieldType', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'newsletter',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Newsletter',
        hint: null,
        placeholder: null,
        dataType: 'BOOLEAN',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.type).toBe('checkbox');
  });

  it('should map SELECT dataType to select FieldType with options', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'category',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Category',
        hint: null,
        placeholder: null,
        dataType: 'SELECT',
        options: [
          { value: 'tech', label: 'Technology' },
          { value: 'sports', label: 'Sports' },
        ],
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.type).toBe('select');
    expect(result[0]!.options).toEqual([
      { value: 'tech', label: 'Technology' },
      { value: 'sports', label: 'Sports' },
    ]);
  });

  it('should map LIST dataType to list FieldType with string options normalized', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'interests',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Interests',
        hint: null,
        placeholder: null,
        dataType: 'LIST',
        options: ['Tech', 'Sports', 'Music'],
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.type).toBe('list');
    expect(result[0]!.options).toEqual([
      { value: 'Tech', label: 'Tech' },
      { value: 'Sports', label: 'Sports' },
      { value: 'Music', label: 'Music' },
    ]);
  });

  it('should handle options with mixed string and object formats', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'mixed',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Mixed',
        hint: null,
        placeholder: null,
        dataType: 'SELECT',
        options: [
          'SimpleOption',
          { value: 'complex', label: 'Complex Option' },
        ] as Array<{ value: string; label: string } | string>,
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.options).toEqual([
      { value: 'SimpleOption', label: 'SimpleOption' },
      { value: 'complex', label: 'Complex Option' },
    ]);
  });

  it('should handle null options', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'name',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
        options: null,
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.options).toBeUndefined();
  });

  it('should handle empty options array', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'name',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
        options: [],
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.options).toBeUndefined();
  });

  it('should pass through width (flexible 1-100)', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'name',
        enabled: true,
        required: true,
        displayOrder: 1,
        width: 60,
        displayName: 'Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.width).toBe(60);
  });

  it('should use propertyDefinitionId as displayName fallback', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'company_name',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: null,
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.displayName).toBe('company_name');
  });

  it('should map propertyDefinitionId to fieldName', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'custom_prop_123',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Custom Property',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('custom_prop_123');
    expect(result[0]!.propertyDefinitionId).toBe('custom_prop_123');
  });

  it('should handle empty array input', () => {
    const result = adaptFieldConfigurations([]);
    expect(result).toEqual([]);
  });

  it('should pass through hint and placeholder', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'email',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Email',
        hint: 'We never share your email',
        placeholder: 'name@example.com',
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.hint).toBe('We never share your email');
    expect(result[0]!.placeholder).toBe('name@example.com');
  });

  it('should convert null placeholder to undefined', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'name',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.placeholder).toBeUndefined();
  });

  it('should set displayOrder on adapted fields', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'field_a',
        enabled: true,
        required: false,
        displayOrder: 5,
        displayName: 'Field A',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.displayOrder).toBe(5);
  });

  it('should use semanticKey for fieldName when provided', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: '507f1f77bcf86cd799439011',
        semanticKey: 'email',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Email Address',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('email');
    expect(result[0]!.propertyDefinitionId).toBe('507f1f77bcf86cd799439011');
  });

  it('should fallback to propertyDefinitionId when semanticKey is missing', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: '507f1f77bcf86cd799439011',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Custom Field',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('507f1f77bcf86cd799439011');
    expect(result[0]!.propertyDefinitionId).toBe('507f1f77bcf86cd799439011');
  });

  it('should fallback to propertyDefinitionId when semanticKey is empty string', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: 'custom_prop_456',
        semanticKey: '',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Custom Property',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('custom_prop_456');
    expect(result[0]!.propertyDefinitionId).toBe('custom_prop_456');
  });

  it('should handle mix of fields with and without semanticKey', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: '507f1f77bcf86cd799439011',
        semanticKey: 'email',
        enabled: true,
        required: true,
        displayOrder: 1,
        displayName: 'Email',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
      {
        propertyDefinitionId: '507f1f77bcf86cd799439012',
        semanticKey: 'firstName',
        enabled: true,
        required: true,
        displayOrder: 2,
        displayName: 'First Name',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
      {
        propertyDefinitionId: '507f1f77bcf86cd799439013',
        enabled: true,
        required: false,
        displayOrder: 3,
        displayName: 'Custom Field',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('email');
    expect(result[0]!.propertyDefinitionId).toBe('507f1f77bcf86cd799439011');
    expect(result[1]!.fieldName).toBe('firstName');
    expect(result[1]!.propertyDefinitionId).toBe('507f1f77bcf86cd799439012');
    expect(result[2]!.fieldName).toBe('507f1f77bcf86cd799439013');
    expect(result[2]!.propertyDefinitionId).toBe('507f1f77bcf86cd799439013');
  });

  it('should use semanticKey for semantic keys like administrativeAreaLevel2', () => {
    const apiFields: ApiFieldConfiguration[] = [
      {
        propertyDefinitionId: '507f1f77bcf86cd799439014',
        semanticKey: 'administrativeAreaLevel2',
        enabled: true,
        required: false,
        displayOrder: 1,
        displayName: 'Province',
        hint: null,
        placeholder: null,
        dataType: 'TEXT',
      },
    ];

    const result = adaptFieldConfigurations(apiFields);
    expect(result[0]!.fieldName).toBe('administrativeAreaLevel2');
    expect(result[0]!.propertyDefinitionId).toBe('507f1f77bcf86cd799439014');
  });
});
