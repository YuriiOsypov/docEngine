/**
 * Remote list resolution for DocEngine resolveListItems({ fieldName, query }).
 *
 * Convention: fieldName may be "ObjectApiName.FieldApiName" (e.g. Account.Industry)
 * for picklist values, or "ObjectApiName" to search Name by query string.
 */
public with sharing class DocEngineListController {
  public class ListItem implements Comparable {
    @AuraEnabled public String id;
    @AuraEnabled public String label;
    @AuraEnabled public String value;
    @AuraEnabled public String code;

    public Integer compareTo(Object other) {
      ListItem o = (ListItem) other;
      String a = label == null ? '' : label.toLowerCase();
      String b = o == null || o.label == null ? '' : o.label.toLowerCase();
      return a.compareTo(b);
    }
  }

  /**
   * @param fieldName Legacy key (field schema name). Prefer sourceCollection when set.
   * @param query Search / filter text
   * @param sourceCollection Optional: ObjectApiName or ObjectApiName.FieldApiName from schema.sourceCollection
   */
  @AuraEnabled
  public static List<ListItem> resolveListItems(
    String fieldName,
    String query,
    String sourceCollection
  ) {
    String key = String.isNotBlank(sourceCollection) ? sourceCollection : fieldName;
    if (String.isBlank(key)) {
      return new List<ListItem>();
    }

    String q = query == null ? '' : query.trim();

    // Picklist: ObjectApiName.FieldApiName
    if (key.contains('.')) {
      List<String> parts = key.split('\\.', 2);
      return resolvePicklist(parts[0], parts[1], q);
    }

    // Record search by Name on the given object
    return searchByName(key, q);
  }

  private static List<ListItem> resolvePicklist(String objectApiName, String fieldApiName, String query) {
    Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
    if (t == null || !t.getDescribe().isAccessible()) {
      return new List<ListItem>();
    }
    Schema.SObjectField f = t.getDescribe().fields.getMap().get(fieldApiName);
    if (f == null) {
      return new List<ListItem>();
    }
    Schema.DescribeFieldResult d = f.getDescribe();
    if (!d.isAccessible()) {
      return new List<ListItem>();
    }
    if (d.getType() != Schema.DisplayType.PICKLIST && d.getType() != Schema.DisplayType.MULTIPICKLIST) {
      return new List<ListItem>();
    }

    String qLower = query.toLowerCase();
    List<ListItem> out = new List<ListItem>();
    for (Schema.PicklistEntry pe : d.getPicklistValues()) {
      if (!pe.isActive()) {
        continue;
      }
      String label = pe.getLabel();
      String value = pe.getValue();
      if (String.isNotBlank(qLower) &&
          !label.toLowerCase().contains(qLower) &&
          !value.toLowerCase().contains(qLower)) {
        continue;
      }
      ListItem item = new ListItem();
      item.id = value;
      item.label = label;
      item.value = value;
      item.code = value;
      out.add(item);
      if (out.size() >= 50) {
        break;
      }
    }
    return out;
  }

  private static List<ListItem> searchByName(String objectApiName, String query) {
    Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
    if (t == null) {
      throw new AuraHandledException(
        'Unknown source collection "' + objectApiName + '". Re-select the collection in field properties.'
      );
    }
    Schema.DescribeSObjectResult objectDescribe = t.getDescribe();
    Map<String, Schema.SObjectField> fields = objectDescribe.fields.getMap();
    if (
      !objectDescribe.isAccessible() ||
      !fields.containsKey('Name') ||
      !fields.containsKey('Id') ||
      !fields.get('Name').getDescribe().isAccessible() ||
      !fields.get('Id').getDescribe().isAccessible()
    ) {
      throw new AuraHandledException(
        'Object "' + objectApiName + '" or its Name field is not accessible.'
      );
    }

    String q = query == null ? '' : query.trim();
    String safeObject = String.escapeSingleQuotes(objectApiName);
    Map<Id, ListItem> byId = new Map<Id, ListItem>();

    if (String.isNotBlank(q)) {
      String prefixExpr = q + '%';
      // ASC + DESC so common prefixes (Bra→Brad…) do not hide later matches (Brandy).
      String soqlAsc =
        'SELECT Id, Name FROM ' +
        safeObject +
        ' WHERE Name LIKE :prefixExpr ORDER BY Name ASC LIMIT 50';
      String soqlDesc =
        'SELECT Id, Name FROM ' +
        safeObject +
        ' WHERE Name LIKE :prefixExpr ORDER BY Name DESC LIMIT 50';
      Map<String, Object> prefixBinds = new Map<String, Object>{
        'prefixExpr' => prefixExpr
      };
      for (
        SObject row : Database.queryWithBinds(
          soqlAsc,
          prefixBinds,
          AccessLevel.USER_MODE
        )
      ) {
        byId.put(row.Id, toNameItem(row));
      }
      for (
        SObject row : Database.queryWithBinds(
          soqlDesc,
          prefixBinds,
          AccessLevel.USER_MODE
        )
      ) {
        byId.put(row.Id, toNameItem(row));
      }
      if (!byId.isEmpty()) {
        return sortItemsByLabel(byId.values());
      }

      String findTerm = q.replace('\\', '\\\\').replace('"', '\\"') + '*';
      String sosl =
        'FIND :findTerm IN NAME FIELDS RETURNING ' +
        safeObject +
        '(Id, Name ORDER BY Name LIMIT 50)';
      List<List<SObject>> groups = Search.query(sosl);
      if (!groups.isEmpty()) {
        for (SObject row : groups[0]) {
          byId.put(row.Id, toNameItem(row));
        }
      }
      if (!byId.isEmpty()) {
        return sortItemsByLabel(byId.values());
      }
    }

    String likeExpr = '%' + q + '%';
    String soql =
      'SELECT Id, Name FROM ' +
      safeObject +
      ' WHERE Name LIKE :likeExpr ORDER BY Name LIMIT 50';
    for (
      SObject row : Database.queryWithBinds(
        soql,
        new Map<String, Object>{ 'likeExpr' => likeExpr },
        AccessLevel.USER_MODE
      )
    ) {
      byId.put(row.Id, toNameItem(row));
    }
    return sortItemsByLabel(byId.values());
  }

  private static List<ListItem> sortItemsByLabel(List<ListItem> items) {
    List<ListItem> out = new List<ListItem>(items);
    out.sort();
    return out;
  }

  private static ListItem toNameItem(SObject row) {
    ListItem item = new ListItem();
    item.id = (String) row.get('Id');
    item.label = (String) row.get('Name');
    item.value = (String) row.get('Name');
    item.code = (String) row.get('Id');
    return item;
  }
}
