import {
  buildSourcePayloadTree,
  normalizeTableColumnSourcePath,
  resolveFieldMappingTarget,
  resolveSourcePath,
  upsertMappingRules,
} from '@docengine/engine';

const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'null']);

/**
 * Last path segment suitable for a field/column label.
 */
export function sourcePathLeafKey(sourcePath: string): string {
  const raw = String(sourcePath ?? '').trim();
  const withoutPayload = raw.replace(/^\$payload\.?/, '');
  if (!withoutPayload) return 'field';
  const bracket = withoutPayload.match(/\[(?:\"([^\"]+)\"|'([^']+)'|([^\]]+))\]\s*$/);
  if (bracket) {
    return bracket[1] || bracket[2] || bracket[3] || 'field';
  }
  const parts = withoutPayload.split('.').filter(Boolean);
  return parts[parts.length - 1] || 'field';
}

/**
 * Sanitize a payload key into a stable table column key.
 */
export function sanitizeColumnKey(key: string): string {
  const cleaned = String(key ?? '')
    .trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'column';
}

/**
 * Turn a payload field key into a display column label.
 * `date_visit_start` → `Date Visit Start`
 * `Account_Number2__c` → `Account Number2`
 * `AcctSeed__Accounting_Active__c` → `Accounting Active`
 */
export function humanizeFieldKey(key: string): string {
  let raw = String(key ?? '').trim();
  if (!raw) return 'Field';
  // Salesforce custom / relationship suffixes
  raw = raw.replace(/__(c|r)$/i, '');
  // Package namespace prefix (AcctSeed__Field → Field)
  const namespaced = raw.match(/^([A-Za-z][A-Za-z0-9]*)__(.+)$/);
  if (namespaced) {
    raw = namespaced[2];
  }
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveColumnLabel(leafKey: string, explicitLabel?: string | null): string {
  const fromMeta = String(explicitLabel ?? '').trim();
  if (fromMeta) return fromMeta;
  return humanizeFieldKey(leafKey);
}

function isScalarType(type: string): boolean {
  return SCALAR_TYPES.has(String(type ?? '').toLowerCase());
}

function describeValueType(value: unknown): string {
  if (value == null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

/** Map payload type → DocEngine field type. */
export function fieldTypeFromSourceType(type: string): 'text' | 'number' | 'logical' {
  const t = String(type ?? '').toLowerCase();
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'logical';
  return 'text';
}

function uniquifyColumnKeys(
  columns: Array<{ key: string; label: string; name: string }>,
): Array<{ key: string; label: string; name: string }> {
  const used = new Set<string>();
  return columns.map((col) => {
    let key = col.key;
    let n = 2;
    while (used.has(key)) {
      key = `${col.key}_${n++}`;
    }
    used.add(key);
    return { ...col, key };
  });
}

function columnsFromObjectRow(path: string, row: Record<string, unknown>) {
  const entries = Object.entries(row).filter(([, value]) => isScalarType(describeValueType(value)));
  if (!entries.length) return null;

  const columns = uniquifyColumnKeys(
    entries.map(([key]) => {
      const colKey = sanitizeColumnKey(key);
      const label = humanizeFieldKey(key);
      return { key: colKey, label, name: label };
    }),
  );

  return {
    label: sourcePathLeafKey(path),
    columns,
    columnSourcePaths: entries.map(([key], index) => ({
      columnKey: columns[index].key,
      sourcePath: /^[a-zA-Z_$][\w$]*$/.test(key)
        ? `${path}.${key}`
        : `${path}[${JSON.stringify(key)}]`,
    })),
  };
}

/**
 * True when `path` is a property of an array-of-objects (table column candidate).
 */
export function isArrayMemberSourcePath(path: string, sample?: unknown): boolean {
  if (!path || sample == null || typeof sample !== 'object') return false;
  const { sourceArrayPath, sourcePath } = normalizeTableColumnSourcePath(path);
  if (!sourceArrayPath || sourceArrayPath === sourcePath || sourceArrayPath === path) {
    return false;
  }
  const parent = resolveSourcePath(sourceArrayPath, sample);
  return Array.isArray(parent);
}

function resolveSourceType(path: string, type: string | undefined, sample: unknown): string {
  let resolvedType = String(type ?? '').toLowerCase();
  if (!resolvedType && sample != null && typeof sample === 'object') {
    resolvedType = describeValueType(resolveSourcePath(path, sample));
  }
  return resolvedType;
}

export type SourcePathDropPlan =
  | {
      kind: 'field';
      label: string;
      fieldType: 'text' | 'number' | 'logical';
      sourcePath: string;
    }
  | {
      kind: 'table-column';
      label: string;
      column: { key: string; label: string; name: string };
      sourcePath: string;
      sourceArrayPath: string;
    }
  | {
      kind: 'table-array';
      label: string;
      columns: Array<{ key: string; label: string; name: string }>;
      columnSourcePaths: Array<{ columnKey: string; sourcePath: string }>;
      sourceArrayPath: string;
    };

/**
 * Classify a Database-tab canvas drop.
 *
 * - Scalar (not under an array) → simple field
 * - Property of an array-of-objects → table column
 * - Array-of-objects itself → multi-column table
 */
export function classifySourcePathDrop(input: {
  path: string;
  type?: string;
  sample?: unknown;
  /** Optional display label from the Database/Fields drag source. */
  label?: string | null;
}): SourcePathDropPlan {
  const path = String(input.path ?? '').trim();
  const sample = input.sample;
  const leaf = sourcePathLeafKey(path);
  const displayLabel = resolveColumnLabel(leaf, input.label);
  const type = resolveSourceType(path, input.type, sample);

  if (type === 'array' && sample != null && typeof sample === 'object') {
    const resolved = resolveSourcePath(path, sample);
    if (
      Array.isArray(resolved) &&
      resolved[0] &&
      typeof resolved[0] === 'object' &&
      !Array.isArray(resolved[0])
    ) {
      const built = columnsFromObjectRow(path, resolved[0] as Record<string, unknown>);
      if (built) {
        return {
          kind: 'table-array',
          label: built.label,
          columns: built.columns,
          columnSourcePaths: built.columnSourcePaths,
          sourceArrayPath: path,
        };
      }
    }

    const tree = buildSourcePayloadTree(sample);
    const node = findSourceNodeByPath(tree, path);
    const scalarChildren = (node?.children ?? []).filter((child: any) => isScalarType(child.type));
    if (scalarChildren.length) {
      const columns = uniquifyColumnKeys(
        scalarChildren.map((child: any) => {
          const key = sanitizeColumnKey(child.key);
          const label = resolveColumnLabel(child.key, child.label);
          return { key, label, name: label };
        }),
      );
      return {
        kind: 'table-array',
        label: displayLabel,
        columns,
        columnSourcePaths: scalarChildren.map((child: any, index: number) => ({
          columnKey: columns[index].key,
          sourcePath: child.path,
        })),
        sourceArrayPath: path,
      };
    }
  }

  if (isArrayMemberSourcePath(path, sample)) {
    const normalized = normalizeTableColumnSourcePath(path);
    const columnKey = sanitizeColumnKey(leaf);
    return {
      kind: 'table-column',
      label: displayLabel,
      column: { key: columnKey, label: displayLabel, name: displayLabel },
      sourcePath: normalized.sourcePath,
      sourceArrayPath: normalized.sourceArrayPath,
    };
  }

  return {
    kind: 'field',
    label: displayLabel,
    fieldType: fieldTypeFromSourceType(type),
    sourcePath: path,
  };
}

/** @deprecated Prefer classifySourcePathDrop */
export function buildTableInsertFromSourcePath(input: {
  path: string;
  type?: string;
  sample?: unknown;
}) {
  const plan = classifySourcePathDrop(input);
  if (plan.kind === 'table-array') {
    return {
      label: plan.label,
      columns: plan.columns,
      columnSourcePaths: plan.columnSourcePaths,
    };
  }
  if (plan.kind === 'table-column') {
    return {
      label: plan.label,
      columns: [plan.column],
      columnSourcePaths: [{ columnKey: plan.column.key, sourcePath: plan.sourcePath }],
    };
  }
  const columnKey = sanitizeColumnKey(plan.label);
  return {
    label: plan.label,
    columns: [{ key: columnKey, label: plan.label, name: plan.label }],
    columnSourcePaths: [{ columnKey, sourcePath: plan.sourcePath }],
  };
}

/**
 * Build mapping rules for a newly inserted/updated table from Database drop column paths.
 */
export function buildTableMappingRulesFromSourceDrop(input: {
  tableFieldId: string;
  blocks: any[];
  fieldSchemas: Record<string, any>;
  columnSourcePaths: Array<{ columnKey: string; sourcePath: string }>;
}) {
  const target = resolveFieldMappingTarget(input.tableFieldId, input.blocks, input.fieldSchemas);
  if (!target) return [];

  return (input.columnSourcePaths ?? []).map(({ columnKey, sourcePath }) => {
    const normalized = normalizeTableColumnSourcePath(sourcePath);
    return {
      section: target.section,
      field: target.field,
      fieldId: input.tableFieldId,
      columnKey,
      sourcePath: normalized.sourcePath,
      sourceArrayPath: normalized.sourceArrayPath,
    };
  });
}

/**
 * Find an existing table fieldId that already maps to the same source array.
 */
export function findTableIdForSourceArrayPath(
  rules: any[] | undefined,
  sourceArrayPath: string,
): string | null {
  const target = String(sourceArrayPath ?? '').trim();
  if (!target) return null;
  for (const rule of rules ?? []) {
    if (!rule?.fieldId || !rule?.columnKey) continue;
    if (String(rule.sourceArrayPath ?? '').trim() === target) {
      return rule.fieldId;
    }
  }
  return null;
}

/**
 * Allocate a unique column key within an existing table schema.
 */
export function allocateUniqueColumnKey(
  existingColumns: Array<{ key?: string }> | undefined,
  preferredKey: string,
): string {
  const base = sanitizeColumnKey(preferredKey);
  const used = new Set((existingColumns ?? []).map((c) => String(c.key ?? '')));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * Merge new rules into an existing (or empty) field-mapping spec.
 */
export function mergeMappingRulesIntoSpec(spec: any, rules: any[]) {
  const base =
    spec && typeof spec === 'object'
      ? { ...spec, rules: Array.isArray(spec.rules) ? [...spec.rules] : [] }
      : { kind: 'fieldMapping', version: 1, expression: '', rules: [] };
  return {
    ...base,
    rules: upsertMappingRules(base.rules, rules),
  };
}

/**
 * Find a tree node by path.
 */
export function findSourceNodeByPath(nodes: any[], targetPath: string): any | null {
  for (const node of nodes ?? []) {
    if (node.path === targetPath) return node;
    if (Array.isArray(node.children)) {
      const found = findSourceNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export { buildSourcePayloadTree };
