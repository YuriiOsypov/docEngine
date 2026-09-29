/**
 * Inverts template fieldMapping (SF → form) into SObject field values (form → SF).
 * Public Forms v1: only simple root paths `$payload.{ApiName}` (optional `#format` suffix).
 * Relationship paths, tables, and childField rules are skipped (answers still live in Document JSON).
 */
public with sharing class DocEngineWriteback {
  private static final Pattern SAFE_IDENT = Pattern.compile('^[A-Za-z][A-Za-z0-9_]*$');
  private static final Set<String> BLOCKED_FIELDS = new Set<String>{
    'ID',
    'OWNERID',
    'CREATEDBYID',
    'LASTMODIFIEDBYID',
    'CREATEDDATE',
    'LASTMODIFIEDDATE',
    'SYSTEMMODSTAMP',
    'ISDELETED',
    'MASTERRECORDID',
    'LASTACTIVITYDATE',
    'LASTVIEWEDDATE',
    'LASTREFERENCEDDATE'
  };

  public class Result {
    public SObject record;
    public Map<String, Object> fieldValues = new Map<String, Object>();
    public List<String> appliedFields = new List<String>();
    public List<String> skipped = new List<String>();
  }

  @TestVisible
  private class WriteRule {
    public String section;
    public String field;
    public String fieldApiName;
    public String formatSuffix;
  }

  /**
   * @param mappingOrTemplateJson fieldMapping JSON, or full template JSON with embedded fieldMapping
   * @param answersJson exportFields() payload (kind: field, sections or values)
   * @param objectApiName target SObject API name (e.g. Lead, Account)
   */
  public static Result apply(
    String mappingOrTemplateJson,
    String answersJson,
    String objectApiName
  ) {
    Object mappingNode = parseMappingNode(mappingOrTemplateJson);
    Object answersNode = parseJsonObject(answersJson, 'answersJson');
    return apply(mappingNode, answersNode, objectApiName, true);
  }

  /**
   * Public Forms path: build SObject values without requiring Guest CRUD/FLS.
   * Callers must DML with AccessLevel.SYSTEM_MODE (see DocEnginePublicFormService).
   */
  public static Result applyElevated(
    String mappingOrTemplateJson,
    String answersJson,
    String objectApiName
  ) {
    Object mappingNode = parseMappingNode(mappingOrTemplateJson);
    Object answersNode = parseJsonObject(answersJson, 'answersJson');
    return apply(mappingNode, answersNode, objectApiName, false);
  }

  /**
   * Same as apply(String…), accepting already-parsed JSON trees.
   * Enforces running-user object/field CRUD (authenticated fillers).
   */
  public static Result apply(
    Object mappingNode,
    Object answersNode,
    String objectApiName
  ) {
    return apply(mappingNode, answersNode, objectApiName, true);
  }

  /**
   * @param respectUserCrud when true, require isCreateable/isUpdateable for running user;
   *        when false (elevated public forms), only structural checks (blocked/calc/auto).
   */
  @TestVisible
  private static Result apply(
    Object mappingNode,
    Object answersNode,
    String objectApiName,
    Boolean respectUserCrud
  ) {
    Result out = new Result();
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('objectApiName is required.');
    }
    Schema.SObjectType sobjectType = Schema.getGlobalDescribe().get(objectApiName.trim());
    if (sobjectType == null) {
      throw new AuraHandledException('Unknown object: ' + objectApiName);
    }
    Schema.DescribeSObjectResult describe = sobjectType.getDescribe();
    if (respectUserCrud == true && !describe.isCreateable() && !describe.isUpdateable()) {
      throw new AuraHandledException('Object is not writable: ' + objectApiName);
    }
    Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();

    Map<String, Object> answersBySection = extractAnswersBySection(answersNode);
    List<WriteRule> rules = collectWriteRules(mappingNode);
    if (rules.isEmpty()) {
      out.skipped.add('No invertible mapping rules.');
      out.record = sobjectType.newSObject();
      return out;
    }

    Map<String, Object> pending = new Map<String, Object>();
    for (WriteRule rule : rules) {
      Object rawVal = lookupAnswer(answersBySection, rule.section, rule.field);
      if (rawVal == null) {
        out.skipped.add(skipLabel(rule, 'no answer value'));
        continue;
      }
      Object scalar = toScalar(rawVal);
      if (scalar == null) {
        out.skipped.add(skipLabel(rule, 'non-scalar answer'));
        continue;
      }

      String api = rule.fieldApiName;
      if (BLOCKED_FIELDS.contains(api.toUpperCase())) {
        out.skipped.add(skipLabel(rule, 'blocked system field'));
        continue;
      }
      // fieldMap keys are case-insensitive via get(), but we need describe token.
      Schema.SObjectField token = fieldMap.get(api);
      if (token == null) {
        out.skipped.add(skipLabel(rule, 'unknown field'));
        continue;
      }
      Schema.DescribeFieldResult fd = token.getDescribe();
      if (BLOCKED_FIELDS.contains(fd.getName().toUpperCase())) {
        out.skipped.add(skipLabel(rule, 'blocked system field'));
        continue;
      }
      if (
        respectUserCrud == true &&
        !fd.isCreateable() &&
        !fd.isUpdateable()
      ) {
        out.skipped.add(skipLabel(rule, 'field not writable'));
        continue;
      }
      if (fd.isCalculated() || fd.isAutoNumber()) {
        out.skipped.add(skipLabel(rule, 'calculated/auto-number'));
        continue;
      }

      Object coerced;
      try {
        coerced = coerceValue(scalar, fd, rule.formatSuffix);
      } catch (Exception e) {
        out.skipped.add(skipLabel(rule, 'coerce failed: ' + e.getMessage()));
        continue;
      }
      if (coerced == null) {
        out.skipped.add(skipLabel(rule, 'empty after coerce'));
        continue;
      }

      // Last rule wins when multiple form fields map to the same API name.
      pending.put(fd.getName(), coerced);
    }

    SObject row = sobjectType.newSObject();
    for (String fieldName : pending.keySet()) {
      row.put(fieldName, pending.get(fieldName));
      out.fieldValues.put(fieldName, pending.get(fieldName));
      out.appliedFields.add(fieldName);
    }
    out.record = row;
    return out;
  }

  /**
   * Applies the subscriber's field-security boundary without requiring Guest
   * object CRUD. Any mapped value removed by FLS is rejected rather than
   * silently producing a partial privileged write.
   */
  public static SObject sanitizeElevatedForDml(Result result, Boolean forUpdate) {
    if (result == null || result.record == null) {
      throw new AuraHandledException('Writeback record is required.');
    }
    AccessType accessType = forUpdate == true
      ? AccessType.UPDATABLE
      : AccessType.CREATABLE;
    SObjectAccessDecision decision = Security.stripInaccessible(
      accessType,
      new List<SObject>{ result.record },
      false
    );
    Set<String> removed = new Set<String>();
    for (Set<String> names : decision.getRemovedFields().values()) {
      removed.addAll(names);
    }
    Set<String> appliedUpper = new Set<String>();
    for (String fieldName : result.appliedFields) {
      appliedUpper.add(fieldName.toUpperCase());
    }
    for (String fieldName : result.record.getPopulatedFieldsAsMap().keySet()) {
      if (!appliedUpper.contains(fieldName.toUpperCase())) {
        throw new AuraHandledException(
          'Public form writeback field is not in the pinned mapping: ' + fieldName + '.'
        );
      }
    }
    for (String fieldName : removed) {
      if (appliedUpper.contains(fieldName.toUpperCase())) {
        throw new AuraHandledException(
          'Public form writeback field is not permitted by field security: ' + fieldName + '.'
        );
      }
    }
    List<SObject> safe = decision.getRecords();
    if (safe == null || safe.isEmpty()) {
      throw new AuraHandledException('Public form writeback was rejected by field security.');
    }
    return safe[0];
  }

  @TestVisible
  private static Object parseMappingNode(String mappingOrTemplateJson) {
    if (String.isBlank(mappingOrTemplateJson)) {
      throw new AuraHandledException('Mapping JSON is required.');
    }
    Object parsed = parseJsonObject(mappingOrTemplateJson, 'mappingJson');
    if (!(parsed instanceof Map<String, Object>)) {
      throw new AuraHandledException('Invalid mapping JSON.');
    }
    Map<String, Object> root = (Map<String, Object>) parsed;
    if (root.containsKey('fieldMapping')) {
      return root.get('fieldMapping');
    }
    return root;
  }

  private static Object parseJsonObject(String rawJson, String label) {
    if (String.isBlank(rawJson)) {
      throw new AuraHandledException(label + ' is required.');
    }
    try {
      return System.JSON.deserializeUntyped(rawJson);
    } catch (Exception e) {
      throw new AuraHandledException('Invalid ' + label + '.');
    }
  }

  @TestVisible
  private static List<WriteRule> collectWriteRules(Object mappingNode) {
    List<WriteRule> rules = new List<WriteRule>();
    if (mappingNode == null) {
      return rules;
    }
    if (mappingNode instanceof Map<String, Object>) {
      Map<String, Object> mapNode = (Map<String, Object>) mappingNode;
      Object rulesNode = mapNode.get('rules');
      if (rulesNode instanceof List<Object>) {
        for (Object item : (List<Object>) rulesNode) {
          addV1Rule(rules, item);
        }
      }
      Object sectionsNode = mapNode.get('sections');
      if (sectionsNode instanceof Map<String, Object>) {
        walkV2Sections(rules, (Map<String, Object>) sectionsNode);
      }
      return rules;
    }
    return rules;
  }

  private static void addV1Rule(List<WriteRule> rules, Object item) {
    if (!(item instanceof Map<String, Object>)) {
      return;
    }
    Map<String, Object> rule = (Map<String, Object>) item;
    if (rule.get('sourceArrayPath') != null && String.isNotBlank(String.valueOf(rule.get('sourceArrayPath')))) {
      return;
    }
    if (rule.get('columnKey') != null && String.isNotBlank(String.valueOf(rule.get('columnKey')))) {
      return;
    }
    if (rule.get('childField') != null && String.isNotBlank(String.valueOf(rule.get('childField')))) {
      return;
    }
    if (rule.get('childFieldPath') != null && String.isNotBlank(String.valueOf(rule.get('childFieldPath')))) {
      return;
    }
    String section = rule.get('section') == null ? null : String.valueOf(rule.get('section'));
    String field = rule.get('field') == null ? null : String.valueOf(rule.get('field'));
    String sourcePath = rule.get('sourcePath') == null ? null : String.valueOf(rule.get('sourcePath'));
    WriteRule wr = toWriteRule(section, field, sourcePath);
    if (wr != null) {
      rules.add(wr);
    }
  }

  private static void walkV2Sections(List<WriteRule> rules, Map<String, Object> sections) {
    for (String sectionName : sections.keySet()) {
      Object sectionVal = sections.get(sectionName);
      if (!(sectionVal instanceof Map<String, Object>)) {
        continue;
      }
      Map<String, Object> fields = (Map<String, Object>) sectionVal;
      for (String fieldName : fields.keySet()) {
        Object fieldVal = fields.get(fieldName);
        if (fieldVal instanceof String) {
          WriteRule wr = toWriteRule(sectionName, fieldName, (String) fieldVal);
          if (wr != null) {
            rules.add(wr);
          }
        }
        // Arrays / nested objects = table or complex — skip (v1).
      }
    }
  }

  @TestVisible
  private static WriteRule toWriteRule(String section, String field, String sourcePath) {
    if (String.isBlank(section) || String.isBlank(field) || String.isBlank(sourcePath)) {
      return null;
    }
    String raw = sourcePath.trim();
    String formatSuffix = null;
    Integer hash = raw.lastIndexOf('#');
    if (hash > 0) {
      // Format suffix only when it looks like a path#format (not a random #).
      String maybePath = raw.substring(0, hash).trim();
      String maybeFmt = raw.substring(hash + 1).trim();
      if (String.isNotBlank(maybePath) && String.isNotBlank(maybeFmt) && !maybeFmt.contains('.')) {
        raw = maybePath;
        formatSuffix = maybeFmt;
      }
    }
    if (raw.startsWith('$payload.')) {
      raw = raw.substring('$payload.'.length());
    } else if (raw == '$payload' || raw.startsWith('$')) {
      return null;
    }
    raw = raw.trim();
    // v1: root field only — no relationship dots, brackets, spaces.
    if (raw.contains('.') || raw.contains('[') || raw.contains('(') || raw.contains(' ') || raw.contains('{')) {
      return null;
    }
    if (!SAFE_IDENT.matcher(raw).matches()) {
      return null;
    }
    WriteRule wr = new WriteRule();
    wr.section = section;
    wr.field = field;
    wr.fieldApiName = raw;
    wr.formatSuffix = formatSuffix;
    return wr;
  }

  @TestVisible
  private static Map<String, Object> extractAnswersBySection(Object answersNode) {
    Map<String, Object> empty = new Map<String, Object>();
    if (!(answersNode instanceof Map<String, Object>)) {
      return empty;
    }
    Map<String, Object> root = (Map<String, Object>) answersNode;
    Object sections = root.get('sections');
    if (sections instanceof Map<String, Object>) {
      return (Map<String, Object>) sections;
    }
    // Legacy flat values keyed by field id — not used with section/field rules.
    return empty;
  }

  private static Object lookupAnswer(
    Map<String, Object> sections,
    String section,
    String field
  ) {
    if (sections == null || String.isBlank(section) || String.isBlank(field)) {
      return null;
    }
    Object sectionNode = sections.get(section);
    if (!(sectionNode instanceof Map<String, Object>)) {
      // Case-insensitive section fallback
      for (String key : sections.keySet()) {
        if (key != null && key.equalsIgnoreCase(section)) {
          sectionNode = sections.get(key);
          break;
        }
      }
    }
    if (!(sectionNode instanceof Map<String, Object>)) {
      return null;
    }
    Map<String, Object> fields = (Map<String, Object>) sectionNode;
    if (fields.containsKey(field)) {
      return fields.get(field);
    }
    for (String key : fields.keySet()) {
      if (key != null && key.equalsIgnoreCase(field)) {
        return fields.get(key);
      }
    }
    return null;
  }

  @TestVisible
  private static Object toScalar(Object rawVal) {
    if (rawVal == null) {
      return null;
    }
    if (
      rawVal instanceof String ||
      rawVal instanceof Boolean ||
      rawVal instanceof Integer ||
      rawVal instanceof Long ||
      rawVal instanceof Double ||
      rawVal instanceof Decimal
    ) {
      if (rawVal instanceof String && String.isBlank((String) rawVal)) {
        return null;
      }
      return rawVal;
    }
    if (rawVal instanceof Map<String, Object>) {
      Map<String, Object> m = (Map<String, Object>) rawVal;
      // Common rich/text wrappers — prefer plain text if present.
      if (m.containsKey('text') && m.get('text') instanceof String) {
        String t = (String) m.get('text');
        return String.isBlank(t) ? null : t;
      }
      // Image/signature objects are not written to ordinary SF fields in v1.
      return null;
    }
    if (rawVal instanceof List<Object>) {
      return null;
    }
    return String.valueOf(rawVal);
  }

  @TestVisible
  private static Object coerceValue(
    Object scalar,
    Schema.DescribeFieldResult fd,
    String formatSuffix
  ) {
    Schema.DisplayType dt = fd.getType();
    if (dt == Schema.DisplayType.Boolean) {
      if (scalar instanceof Boolean) {
        return scalar;
      }
      String s = String.valueOf(scalar).trim().toLowerCase();
      return s == 'true' || s == '1' || s == 'yes';
    }
    if (dt == Schema.DisplayType.Date) {
      return coerceDate(scalar, formatSuffix);
    }
    if (dt == Schema.DisplayType.DateTime) {
      Date d = coerceDate(scalar, formatSuffix);
      if (d == null) {
        return coerceDateTime(scalar);
      }
      return Datetime.newInstanceGmt(d, Time.newInstance(0, 0, 0, 0));
    }
    if (
      dt == Schema.DisplayType.Integer ||
      dt == Schema.DisplayType.Long ||
      dt == Schema.DisplayType.Double ||
      dt == Schema.DisplayType.Currency ||
      dt == Schema.DisplayType.Percent
    ) {
      if (scalar instanceof Decimal) {
        return scalar;
      }
      if (scalar instanceof Integer || scalar instanceof Long || scalar instanceof Double) {
        return Decimal.valueOf(String.valueOf(scalar));
      }
      String s = String.valueOf(scalar).trim().replace(',', '');
      if (String.isBlank(s)) {
        return null;
      }
      return Decimal.valueOf(s);
    }
    if (dt == Schema.DisplayType.Reference) {
      // v1: only accept a literal Id string for createable lookups (not OwnerId — blocked above).
      String s = String.valueOf(scalar).trim();
      if (s.length() == 15 || s.length() == 18) {
        try {
          return Id.valueOf(s);
        } catch (Exception e) {
          return null;
        }
      }
      return null;
    }
    // String-like: String, TextArea, Email, Phone, Url, Picklist, Multipicklist, Combobox, …
    String asText = String.valueOf(scalar);
    Integer maxLen = fd.getLength();
    if (maxLen != null && maxLen > 0 && asText.length() > maxLen) {
      asText = asText.substring(0, maxLen);
    }
    return asText;
  }

  private static Date coerceDate(Object scalar, String formatSuffix) {
    if (scalar instanceof Date) {
      return (Date) scalar;
    }
    if (scalar instanceof Datetime) {
      return ((Datetime) scalar).dateGmt();
    }
    String s = String.valueOf(scalar).trim();
    if (String.isBlank(s)) {
      return null;
    }
    // ISO date or datetime prefix
    if (Pattern.matches('^\\d{4}-\\d{2}-\\d{2}.*', s)) {
      String day = s.length() >= 10 ? s.substring(0, 10) : s;
      return Date.valueOf(day);
    }
    if (!Pattern.matches('^\\d{2}/\\d{2}/\\d{4}$', s)) {
      return null;
    }
    List<String> parts = s.split('/');
    Integer a = Integer.valueOf(parts[0]);
    Integer b = Integer.valueOf(parts[1]);
    Integer year = Integer.valueOf(parts[2]);
    String fmt = formatSuffix == null ? '' : formatSuffix.trim().toLowerCase();
    // mm/dd only when the mapping suffix says so; otherwise treat as dd/mm/yyyy.
    if (fmt == 'mm/dd/yyyy') {
      return Date.newInstance(year, a, b);
    }
    return Date.newInstance(year, b, a);
  }

  private static Datetime coerceDateTime(Object scalar) {
    if (scalar instanceof Datetime) {
      return (Datetime) scalar;
    }
    String s = String.valueOf(scalar).trim();
    if (String.isBlank(s)) {
      return null;
    }
    try {
      return Datetime.valueOfGmt(s.replace('T', ' ').replace('Z', ''));
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Build a guest-safe values export (kind: field) from an existing record for Update links.
   * Only simple root fields from invertible mapping rules — never returns raw SOQL payload.
   */
  public static Map<String, Object> buildPrefill(
    String mappingOrTemplateJson,
    Id recordId,
    String objectApiName
  ) {
    if (recordId == null || String.isBlank(objectApiName)) {
      return null;
    }
    Object mappingNode = parseMappingNode(mappingOrTemplateJson);
    List<WriteRule> rules = collectWriteRules(mappingNode);
    if (rules.isEmpty()) {
      return null;
    }

    Schema.SObjectType sobjectType = Schema.getGlobalDescribe().get(objectApiName.trim());
    if (sobjectType == null) {
      return null;
    }
    Map<String, Schema.SObjectField> fieldMap = sobjectType.getDescribe().fields.getMap();
    Set<String> selectFields = new Set<String>{ 'Id' };
    for (WriteRule rule : rules) {
      if (fieldMap.containsKey(rule.fieldApiName)) {
        selectFields.add(fieldMap.get(rule.fieldApiName).getDescribe().getName());
      }
    }
    if (selectFields.size() == 1) {
      return null;
    }

    String soql =
      'SELECT ' +
      String.join(new List<String>(selectFields), ',') +
      ' FROM ' +
      String.escapeSingleQuotes(objectApiName.trim()) +
      ' WHERE Id = :recordId LIMIT 1';
    // Guest update-form prefill intentionally bypasses guest object and field access.
    List<SObject> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{ 'recordId' => recordId },
      AccessLevel.SYSTEM_MODE
    );
    if (rows.isEmpty()) {
      return null;
    }
    SObject row = rows[0];

    Map<String, Object> sections = new Map<String, Object>();
    for (WriteRule rule : rules) {
      if (!fieldMap.containsKey(rule.fieldApiName)) {
        continue;
      }
      String api = fieldMap.get(rule.fieldApiName).getDescribe().getName();
      Object val = row.get(api);
      if (val == null) {
        continue;
      }
      // Dates as ISO strings for the fill editor.
      if (val instanceof Date) {
        val = String.valueOf((Date) val);
      } else if (val instanceof Datetime) {
        val = ((Datetime) val).formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
      } else if (val instanceof Id) {
        val = String.valueOf(val);
      }
      if (!sections.containsKey(rule.section)) {
        sections.put(rule.section, new Map<String, Object>());
      }
      ((Map<String, Object>) sections.get(rule.section)).put(rule.field, val);
    }
    if (sections.isEmpty()) {
      return null;
    }
    Map<String, Object> out = new Map<String, Object>();
    out.put('kind', 'field');
    out.put('version', 2);
    out.put('time', Datetime.now().getTime());
    out.put('sections', sections);
    return out;
  }

  private static String skipLabel(WriteRule rule, String reason) {
    return rule.section +
      '.' +
      rule.field +
      ' → ' +
      rule.fieldApiName +
      ' (' +
      reason +
      ')';
  }
}
