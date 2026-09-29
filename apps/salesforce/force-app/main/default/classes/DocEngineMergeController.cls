/**
 * Builds a JSON-serializable payload from a Salesforce record for
 * editor.applyFieldMapping(payload), using fieldMapping embedded in Template_JSON__c.
 *
 * Walks v1 rules and v2 sections to collect $payload paths, then builds a
 * minimal SOQL (root fields, parent chains, child subqueries with nested
 * parent lookups) and serializes the result as a nested Map matching
 * Field Mapping paths (e.g. Sales_Lines__r.Item__r.Name).
 */
public with sharing class DocEngineMergeController {
  private static final Integer MAX_CHILD_ROWS = 200;
  private static final Pattern SAFE_IDENT = Pattern.compile('^[A-Za-z][A-Za-z0-9_]*$');

  /**
   * @param templateVersionId Optional pinned version; when null uses Current_Version / head JSON.
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> buildPayload(
    Id recordId,
    Id templateId,
    Id templateVersionId
  ) {
    if (recordId == null) {
      throw new AuraHandledException('recordId is required.');
    }
    if (templateId == null) {
      throw new AuraHandledException('templateId is required.');
    }

    DocEngineAccess.assertTemplateAccess(templateId);

    DocEngine_Template__c template = [
      SELECT
        Id,
        Object_API_Name__c,
        Template_JSON__c,
        Current_Version__c,
        Current_Version__r.Template_JSON__c
      FROM DocEngine_Template__c
      WHERE Id = :templateId
      WITH USER_MODE
      LIMIT 1
    ];

    String objectApiName = template.Object_API_Name__c;
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('Template has no Object_API_Name__c.');
    }

    String templateJson = resolveTemplateJson(template, templateVersionId);

    Schema.SObjectType sobjectType = Schema.getGlobalDescribe().get(objectApiName);
    if (sobjectType == null) {
      throw new AuraHandledException('Unknown object: ' + objectApiName);
    }
    Schema.DescribeSObjectResult describe = sobjectType.getDescribe();
    if (!describe.isAccessible()) {
      throw new AuraHandledException('Object is not accessible: ' + objectApiName);
    }
    Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();
    if (
      !fieldMap.containsKey('Id') ||
      !fieldMap.get('Id').getDescribe().isAccessible()
    ) {
      throw new AuraHandledException('Object Id field is not accessible: ' + objectApiName);
    }
    Map<String, Schema.ChildRelationship> childByName = childRelationshipsByName(describe);

    Set<String> fieldPaths = collectSourceFieldPaths(
      extractFieldMappingJson(templateJson)
    );
    fieldPaths.add('Id');

    Set<String> rootSelects = new Set<String>();
    // childRelName -> set of select expressions (Id, Qty__c, Item__r.Name, …)
    Map<String, Set<String>> childFieldSelects = new Map<String, Set<String>>();

    for (String path : fieldPaths) {
      if (String.isBlank(path)) {
        continue;
      }
      List<String> parts = path.split('\\.');
      if (parts.isEmpty() || String.isBlank(parts[0])) {
        continue;
      }

      String head = parts[0];
      if (childByName.containsKey(head)) {
        Schema.ChildRelationship childRelationship = childByName.get(head);
        if (!isAccessibleChildRelationship(childRelationship)) {
          continue;
        }
        ensureChildSelect(childFieldSelects, head, childRelationship);
        if (parts.size() == 1) {
          continue;
        }
        String childSelect = String.join(slice(parts, 1), '.');
        if (isSafeSelectPath(childRelationship.getChildSObject().getDescribe(), childSelect)) {
          childFieldSelects.get(head).add(childSelect);
        }
        continue;
      }

      if (parts.size() == 1) {
        if (
          fieldMap.containsKey(head) &&
          fieldMap.get(head).getDescribe().isAccessible()
        ) {
          rootSelects.add(head);
        }
        continue;
      }

      if (isSafeSelectPath(describe, path)) {
        rootSelects.add(path);
      }
    }

    if (rootSelects.isEmpty()) {
      rootSelects.add('Id');
    }

    List<String> selectable = new List<String>(rootSelects);
    for (String relName : childFieldSelects.keySet()) {
      Set<String> childFields = childFieldSelects.get(relName);
      if (childFields.isEmpty()) {
        childFields.add('Id');
      }
      List<String> childList = new List<String>(childFields);
      selectable.add(
        '(SELECT ' +
          String.join(childList, ', ') +
          ' FROM ' +
          String.escapeSingleQuotes(relName) +
          ' LIMIT ' +
          String.valueOf(MAX_CHILD_ROWS) +
          ')'
      );
    }

    String soql =
      'SELECT ' +
      String.join(selectable, ', ') +
      ' FROM ' +
      String.escapeSingleQuotes(objectApiName) +
      ' WHERE Id = :recordId LIMIT 1';

    List<SObject> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{ 'recordId' => recordId },
      AccessLevel.USER_MODE
    );
    if (rows.isEmpty()) {
      throw new AuraHandledException('Record not found.');
    }

    return sobjectToMap(rows[0], new List<String>(rootSelects), childFieldSelects);
  }

  private static Map<String, Schema.ChildRelationship> childRelationshipsByName(
    Schema.DescribeSObjectResult describe
  ) {
    Map<String, Schema.ChildRelationship> out = new Map<String, Schema.ChildRelationship>();
    for (Schema.ChildRelationship cr : describe.getChildRelationships()) {
      String name = cr.getRelationshipName();
      if (String.isNotBlank(name)) {
        out.put(name, cr);
      }
    }
    return out;
  }

  private static void ensureChildSelect(
    Map<String, Set<String>> childFieldSelects,
    String relName,
    Schema.ChildRelationship cr
  ) {
    if (!childFieldSelects.containsKey(relName)) {
      Set<String> defaults = new Set<String>{ 'Id' };
      if (isSafeChildField(cr, 'Name')) {
        defaults.add('Name');
      }
      childFieldSelects.put(relName, defaults);
    }
  }

  private static Boolean isSafeChildField(Schema.ChildRelationship cr, String fieldApiName) {
    if (cr == null || String.isBlank(fieldApiName)) {
      return false;
    }
    if (!SAFE_IDENT.matcher(fieldApiName).matches()) {
      return false;
    }
    Schema.DescribeSObjectResult childDescribe = cr.getChildSObject().getDescribe();
    if (!childDescribe.isAccessible()) {
      return false;
    }
    Map<String, Schema.SObjectField> fields = childDescribe.fields.getMap();
    if (!fields.containsKey(fieldApiName)) {
      return false;
    }
    return fields.get(fieldApiName).getDescribe().isAccessible();
  }

  private static Boolean isAccessibleChildRelationship(Schema.ChildRelationship cr) {
    return cr != null &&
      cr.getField() != null &&
      cr.getField().getDescribe().isAccessible() &&
      isSafeChildField(cr, 'Id');
  }

  /**
   * Validate a dotted SOQL select path relative to describe
   * (e.g. "Name", "Owner.Name", "Item__r.GFERP__Description__c").
   */
  @TestVisible
  private static Boolean isSafeSelectPath(Schema.DescribeSObjectResult describe, String path) {
    if (String.isBlank(path) || describe == null) {
      return false;
    }
    List<String> parts = path.split('\\.');
    Schema.DescribeSObjectResult current = describe;
    for (Integer i = 0; i < parts.size(); i++) {
      String part = parts[i];
      if (!SAFE_IDENT.matcher(part).matches()) {
        return false;
      }
      Boolean isLast = (i == parts.size() - 1);
      Map<String, Schema.SObjectField> fields = current.fields.getMap();

      if (isLast) {
        if (!fields.containsKey(part)) {
          return false;
        }
        return fields.get(part).getDescribe().isAccessible();
      }

      // Relationship segment (Owner, Item__r, …)
      Schema.DescribeSObjectResult next = resolveParentDescribe(current, part);
      if (next == null) {
        return false;
      }
      current = next;
    }
    return false;
  }

  private static Schema.DescribeSObjectResult resolveParentDescribe(
    Schema.DescribeSObjectResult current,
    String relationshipName
  ) {
    for (Schema.SObjectField f : current.fields.getMap().values()) {
      Schema.DescribeFieldResult fd = f.getDescribe();
      if (fd.getRelationshipName() == relationshipName) {
        if (!fd.isAccessible()) {
          return null;
        }
        List<Schema.SObjectType> refs = fd.getReferenceTo();
        if (refs != null && !refs.isEmpty()) {
          Schema.DescribeSObjectResult referenced = refs[0].getDescribe();
          return referenced.isAccessible() ? referenced : null;
        }
      }
    }
    return null;
  }

  /**
   * Resolve template JSON from a pinned version, Current_Version, or head field.
   */
  @TestVisible
  private static String resolveTemplateJson(
    DocEngine_Template__c template,
    Id templateVersionId
  ) {
    if (templateVersionId != null) {
      List<DocEngine_Template_Version__c> versions = [
        SELECT Id, Template_JSON__c, Template__c
        FROM DocEngine_Template_Version__c
        WHERE Id = :templateVersionId
        WITH USER_MODE
        LIMIT 1
      ];
      if (versions.isEmpty()) {
        throw new AuraHandledException('Template version not found.');
      }
      if (versions[0].Template__c != template.Id) {
        throw new AuraHandledException('Template version does not belong to this template.');
      }
      return versions[0].Template_JSON__c;
    }
    if (
      template.Current_Version__c != null &&
      template.Current_Version__r != null &&
      String.isNotBlank(template.Current_Version__r.Template_JSON__c)
    ) {
      return template.Current_Version__r.Template_JSON__c;
    }
    return template.Template_JSON__c;
  }

  /**
   * Read fieldMapping from Template_JSON__c (embedded on template export).
   */
  @TestVisible
  private static String extractFieldMappingJson(String templateJson) {
    if (String.isBlank(templateJson)) {
      return null;
    }
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(templateJson);
    } catch (Exception e) {
      throw new AuraHandledException('Invalid Template_JSON__c: ' + e.getMessage());
    }
    if (!(parsed instanceof Map<String, Object>)) {
      return null;
    }
    Object mapping = ((Map<String, Object>) parsed).get('fieldMapping');
    if (mapping == null) {
      return null;
    }
    return JSON.serialize(mapping);
  }

  /**
   * Extract unique source field paths from a fieldMapping JSON string
   * (or a legacy values mapping with $payload paths).
   * Supports v1 rules[] and v2 sections{} (kind: field).
   */
  @TestVisible
  private static Set<String> collectSourceFieldPaths(String fieldMappingJson) {
    Set<String> paths = new Set<String>();
    if (String.isBlank(fieldMappingJson)) {
      return paths;
    }
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(fieldMappingJson);
    } catch (Exception e) {
      throw new AuraHandledException('Invalid fieldMapping: ' + e.getMessage());
    }
    walkMappingForPaths(parsed, paths);
    return paths;
  }

  private static void walkMappingForPaths(Object node, Set<String> paths) {
    if (node == null) {
      return;
    }
    if (node instanceof String) {
      String s = (String) node;
      // Section values use $payload.… ; bare API names only via sourcePath keys below
      if (s.startsWith('$payload.') || s == '$payload') {
        addNormalizedPath(paths, s);
      }
      return;
    }
    if (node instanceof List<Object>) {
      for (Object item : (List<Object>) node) {
        walkMappingForPaths(item, paths);
      }
      return;
    }
    if (!(node instanceof Map<String, Object>)) {
      return;
    }
    Map<String, Object> mapNode = (Map<String, Object>) node;

    // v1 rules: prefer explicit sourcePath / sourceArrayPath keys (may omit $payload.)
    addNormalizedPath(paths, (String) mapNode.get('sourcePath'));
    addNormalizedPath(paths, (String) mapNode.get('sourceArrayPath'));

    for (Object value : mapNode.values()) {
      walkMappingForPaths(value, paths);
    }
  }

  private static void addNormalizedPath(Set<String> paths, String raw) {
    if (String.isBlank(raw)) {
      return;
    }
    String path = raw.trim();
    if (path.startsWith('$payload.')) {
      path = path.substring('$payload.'.length());
    } else if (path == '$payload') {
      return;
    } else if (path.startsWith('$')) {
      // expressions / other bindings — skip
      return;
    }
    if (path.contains('[') || path.contains('(') || path.contains(' ') || path.contains('{')) {
      return;
    }
    if (!Pattern.matches('^[A-Za-z][A-Za-z0-9_\\.]*$', path)) {
      return;
    }
    if (String.isNotBlank(path)) {
      paths.add(path);
    }
  }

  /**
   * Allow simple fields and relationship fields. Kept for unit tests.
   */
  @TestVisible
  private static Boolean isSafeFieldPath(
    String path,
    Map<String, Schema.SObjectField> fieldMap,
    String objectApiName
  ) {
    if (String.isBlank(path) || !Pattern.matches('^[A-Za-z][A-Za-z0-9_\\.]*$', path)) {
      return false;
    }
    Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
    if (t == null) {
      return false;
    }
    Schema.DescribeSObjectResult describe = t.getDescribe();
    Map<String, Schema.ChildRelationship> children = childRelationshipsByName(describe);

    List<String> parts = path.split('\\.');
    if (children.containsKey(parts[0])) {
      if (parts.size() == 1) {
        return true;
      }
      return isSafeSelectPath(children.get(parts[0]).getChildSObject().getDescribe(), String.join(slice(parts, 1), '.'));
    }
    return isSafeSelectPath(describe, path);
  }

  private static Map<String, Object> sobjectToMap(
    SObject row,
    List<String> rootSelects,
    Map<String, Set<String>> childFieldSelects
  ) {
    Map<String, Object> payload = new Map<String, Object>();

    // Always expose Id when queried
    payload.put('Id', row.get('Id'));

    for (String path : rootSelects) {
      putPathValue(payload, path, getPathValue(row, path));
    }

    for (String relName : childFieldSelects.keySet()) {
      List<SObject> children = row.getSObjects(relName);
      List<Object> rowsOut = new List<Object>();
      Set<String> childSelects = childFieldSelects.get(relName);
      if (children != null) {
        for (SObject child : children) {
          rowsOut.add(sobjectBranchToMap(child, childSelects));
        }
      }
      payload.put(relName, rowsOut);
    }
    return payload;
  }

  /**
   * Build a nested map for one child (or related) row using the select expressions
   * that were requested for that relationship.
   */
  private static Map<String, Object> sobjectBranchToMap(SObject row, Set<String> selectPaths) {
    Map<String, Object> out = new Map<String, Object>();
    if (row == null) {
      return out;
    }
    // Include all populated scalar + nested SObject fields from the query
    Map<String, Object> populated = row.getPopulatedFieldsAsMap();
    for (String key : populated.keySet()) {
      Object val = populated.get(key);
      if (val instanceof SObject) {
        out.put(key, sobjectToNestedMap((SObject) val));
      } else if (!(val instanceof List<SObject>)) {
        out.put(key, val);
      }
    }
    // Ensure every requested select path is present (flat and dotted).
    // Skip null overwrites for flat fields not returned by the query (FLS / not selected).
    if (selectPaths != null) {
      for (String path : selectPaths) {
        Object value = getPathValue(row, path);
        if (!path.contains('.')) {
          if (value != null || !out.containsKey(path)) {
            if (value != null) {
              out.put(path, value);
            }
          }
          continue;
        }
        if (value instanceof SObject) {
          putPathValue(out, path, sobjectToNestedMap((SObject) value));
        } else if (value != null) {
          putPathValue(out, path, value);
        }
      }
    }
    return out;
  }

  private static Map<String, Object> sobjectToNestedMap(SObject row) {
    Map<String, Object> out = new Map<String, Object>();
    if (row == null) {
      return out;
    }
    Map<String, Object> populated = row.getPopulatedFieldsAsMap();
    for (String key : populated.keySet()) {
      Object val = populated.get(key);
      if (val instanceof SObject) {
        out.put(key, sobjectToNestedMap((SObject) val));
      } else if (!(val instanceof List<SObject>)) {
        out.put(key, val);
      }
    }
    return out;
  }

  private static Object getPathValue(SObject row, String path) {
    if (row == null || String.isBlank(path)) {
      return null;
    }
    List<String> parts = path.split('\\.');
    SObject current = row;
    for (Integer i = 0; i < parts.size() - 1; i++) {
      current = current.getSObject(parts[i]);
      if (current == null) {
        return null;
      }
    }
    try {
      return current.get(parts[parts.size() - 1]);
    } catch (Exception e) {
      return null;
    }
  }

  private static void putPathValue(Map<String, Object> root, String path, Object value) {
    if (root == null || String.isBlank(path)) {
      return;
    }
    List<String> parts = path.split('\\.');
    Map<String, Object> cur = root;
    for (Integer i = 0; i < parts.size() - 1; i++) {
      Object next = cur.get(parts[i]);
      if (!(next instanceof Map<String, Object>)) {
        next = new Map<String, Object>();
        cur.put(parts[i], next);
      }
      cur = (Map<String, Object>) next;
    }
    cur.put(parts[parts.size() - 1], value);
  }

  private static List<String> slice(List<String> parts, Integer startIndex) {
    List<String> out = new List<String>();
    for (Integer i = startIndex; i < parts.size(); i++) {
      out.add(parts[i]);
    }
    return out;
  }
}
