import {
  applyDocumentValues,
  buildDocExport,
  buildDocumentExport,
  isDocExport,
  isFieldsExport,
  normalizeDocumentValues,
  normalizeTemplateFieldSchemas,
  applyFieldMapping,
  isFieldMappingSpec,
} from '@docengine/engine';
import {
  generateDocumentHtml,
  generateDocumentPdf,
  generateHtmlFromTemplate,
  generatePdfFromTemplate,
} from '@docengine/pdf-renderer';

/**
 * Template JSON (kind: "template") from the document editor.
 * Kept local so n8n does not depend on unpublished editor type aliases.
 */
export type TemplateExport = {
  kind: 'template';
  fieldSchemas?: Record<string, any>;
  blocks?: any[];
  pageSetup?: Record<string, any>;
  fieldMapping?: unknown;
  [key: string]: unknown;
};

export function assertTemplate(template: unknown): TemplateExport {
  if (!template || typeof template !== 'object' || (template as any).kind !== 'template') {
    throw new Error('Invalid template: expected JSON with kind "template", blocks, and fieldSchemas.');
  }
  const t = template as TemplateExport;
  return {
    ...t,
    fieldSchemas: normalizeTemplateFieldSchemas(t.fieldSchemas ?? {}),
  };
}

export function getByPath(path: string, data: Record<string, unknown> | null | undefined): unknown {
  if (path != null && typeof path !== 'string') return undefined;
  const trimmed = String(path ?? '').trim();
  if (!trimmed) return data;

  const parts = trimmed.split('.').filter(Boolean);
  let current: any = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Resolve field values from the n8n "Values JSON Path" parameter.
 *
 * n8n may return:
 * - an object (JS / expression mode, or a JSON mapping)
 * - a JSON string of that object
 * - a dot-path into the incoming item (`sections`, `body.values`, …)
 * - empty → use the whole item JSON
 *
 * Previously an object/JSON mapping was treated as a path, missed, and silently
 * fell back to the entire incoming item (so a prior document/PDF payload was
 * rendered instead of the stored template + mapped values).
 */
export function resolveInputValues(
  rawParam: unknown,
  itemJson: Record<string, unknown> | null | undefined,
): unknown {
  const fallback = itemJson ?? {};

  if (rawParam == null) return fallback;

  if (typeof rawParam === 'object') {
    return rawParam;
  }

  if (typeof rawParam !== 'string') {
    return rawParam;
  }

  const str = rawParam.trim();
  if (!str) return fallback;

  if (
    (str.startsWith('{') && str.endsWith('}')) ||
    (str.startsWith('[') && str.endsWith(']'))
  ) {
    try {
      return JSON.parse(str);
    } catch {
      throw new Error(
        'Values JSON is not valid JSON. Use a dot-path (e.g. sections) or a JSON object of field values.',
      );
    }
  }

  const fromPath = getByPath(str, fallback);
  if (fromPath === undefined) {
    throw new Error(`Values JSON Path "${str}" was not found on the incoming item.`);
  }
  return fromPath;
}

export function resolveTemplateFromItem(itemJson: Record<string, unknown>, path: unknown = ''): TemplateExport {
  // n8n expression mode (`{{ $json.body.template }}`) passes the resolved object, not a path.
  if (path && typeof path === 'object' && !Array.isArray(path)) {
    return assertTemplate(path);
  }

  const raw = getByPath(typeof path === 'string' ? path : '', itemJson ?? {});
  const template = raw ?? itemJson ?? {};
  if (typeof template === 'string') {
    return assertTemplate(parseJsonText(template));
  }
  return assertTemplate(template);
}

type MergeOptions = {
  applyFieldMappingFromTemplate?: boolean;
  payloadJsonPath?: string;
};

/**
 * Filled editor snapshot: values live in blocks[].data.fieldValues.
 * Salesforce callouts often omit `kind: "document"` but still send blocks + fieldSchemas.
 */
export function isFilledDocumentSnapshot(data: unknown): boolean {
  if (isDocExport(data)) return true;
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, any>;
  if (d.kind === 'template' || isFieldsExport(data)) return false;
  return Array.isArray(d.blocks);
}

function mergeTemplateWithValues(template: TemplateExport, rawValues: unknown, options: MergeOptions = {}) {
  // Salesforce HTML preview / View as PDF sends a filled snapshot (blocks with fieldValues).
  // Rebinding that onto the empty template drops line items, addresses, and other token values.
  if (!options.applyFieldMappingFromTemplate && isFilledDocumentSnapshot(rawValues)) {
    const filled = rawValues as Record<string, any>;
    return {
      fieldSchemas: {
        ...(template.fieldSchemas ?? {}),
        ...(filled.fieldSchemas ?? {}),
      },
      blocks: JSON.parse(JSON.stringify(filled.blocks ?? [])),
      pageSetup: filled.pageSetup ?? template.pageSetup,
    };
  }

  const blocks = template.blocks ?? [];
  const fieldSchemas = template.fieldSchemas ?? {};

  let sourcePayload = rawValues;
  if (options.applyFieldMappingFromTemplate && isFieldMappingSpec(template.fieldMapping)) {
    const payloadPath = String(options.payloadJsonPath ?? '').trim();
    sourcePayload = payloadPath ? getByPath(payloadPath, (rawValues ?? {}) as Record<string, unknown>) : rawValues;
    const mapped = applyFieldMapping(sourcePayload ?? {}, template.fieldMapping, template);
    rawValues = mapped.fieldsExport;
  }

  const payload =
    rawValues && typeof rawValues === 'object' && isFieldsExport(rawValues)
      ? rawValues
      : rawValues && typeof rawValues === 'object' && (rawValues as any).sections
        ? rawValues
        : rawValues && typeof rawValues === 'object' && (rawValues as any).values
          ? rawValues
          : { values: rawValues ?? {} };

  const values = normalizeDocumentValues(payload, blocks, fieldSchemas);
  return {
    ...applyDocumentValues(blocks, values, fieldSchemas),
    pageSetup: template.pageSetup,
  };
}

type BuildOptions = MergeOptions & { hideEmptyValues?: boolean };

export function buildDocumentExportFromInput(template: TemplateExport, rawValues: unknown, options: BuildOptions = {}) {
  const hideEmptyValues = options.hideEmptyValues === true;
  const merged = mergeTemplateWithValues(template, rawValues, options);

  return buildDocumentExport(
    {
      time: Date.now(),
      fieldSchemas: merged.fieldSchemas,
      blocks: merged.blocks,
      pageSetup: merged.pageSetup ?? template.pageSetup,
    },
    { hideEmptyValues },
  );
}

export function buildFullDocumentExport(template: TemplateExport, rawValues: unknown, options: BuildOptions = {}) {
  const hideEmptyValues = options.hideEmptyValues === true;
  const fields = buildDocumentExportFromInput(template, rawValues, options);
  const merged = mergeTemplateWithValues(template, rawValues, options);

  const doc = buildDocExport({
    time: Date.now(),
    fieldSchemas: merged.fieldSchemas,
    blocks: merged.blocks,
    pageSetup: merged.pageSetup ?? template.pageSetup,
  });

  return {
    kind: 'docengine-document',
    version: 1,
    time: Date.now(),
    hideEmptyValues,
    template,
    fields,
    doc,
    /** @deprecated Use `fields` */
    document: fields,
  };
}

type RenderOptions = BuildOptions & { outputFormat?: 'html' | 'pdf' };

/** Match Node DocEngine defaults: only DejaVu is embedded in the n8n VFS bundle. */
const N8N_PDF_FONTS = { preset: 'dejavu' } as const;

function asBinary(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function renderDocument(template: TemplateExport, rawValues: unknown, options: RenderOptions = {}) {
  const hideEmptyValues = options.hideEmptyValues === true;
  const outputFormat = options.outputFormat === 'pdf' ? 'pdf' : 'html';

  if (!options.applyFieldMappingFromTemplate && isFilledDocumentSnapshot(rawValues)) {
    const filled = rawValues as Record<string, any>;
    const pageSetup = filled.pageSetup ?? template.pageSetup;
    const doc = {
      ...filled,
      kind: filled.kind ?? 'document',
      blocks: JSON.parse(JSON.stringify(filled.blocks ?? [])),
      fieldSchemas: {
        ...(template.fieldSchemas ?? {}),
        ...(filled.fieldSchemas ?? {}),
      },
      pageSetup,
    };
    if (outputFormat === 'pdf') {
      const data = await generateDocumentPdf(doc, {
        pageSetup,
        hideEmptyValues,
        fonts: N8N_PDF_FONTS,
      });
      return { mimeType: 'application/pdf', fileExtension: 'pdf', data: asBinary(data) };
    }
    const html = await generateDocumentHtml(doc, { pageSetup, fullDocument: true, hideEmptyValues });
    return {
      mimeType: 'text/html',
      fileExtension: 'html',
      data: Buffer.from(html, 'utf8'),
    };
  }

  const document = buildDocumentExportFromInput(template, rawValues, options);

  if (outputFormat === 'pdf') {
    const data = await generatePdfFromTemplate({
      template,
      document,
      hideEmptyValues,
      fonts: N8N_PDF_FONTS,
    });
    return { mimeType: 'application/pdf', fileExtension: 'pdf', data: asBinary(data) };
  }

  const html = await generateHtmlFromTemplate({
    template,
    document,
    fullDocument: true,
    hideEmptyValues,
  });
  return {
    mimeType: 'text/html',
    fileExtension: 'html',
    data: Buffer.from(html, 'utf8'),
  };
}

export function parseJsonText(raw: string): unknown {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Template JSON is empty.');
  }
  return JSON.parse(raw);
}
