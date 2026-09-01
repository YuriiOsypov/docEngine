/**
 * System-context helpers for DocEngine_Template_Version__c.
 * Fill users are read-only on templates; this class creates/pins version snapshots.
 */
public without sharing class DocEngineTemplateVersionService {
  public static Id ensureCurrentVersionId(Id templateId) {
    if (templateId == null) {
      throw new AuraHandledException('templateId is required.');
    }
    List<DocEngine_Template__c> rows = [
      SELECT Id, Version__c, Template_JSON__c, Current_Version__c
      FROM DocEngine_Template__c
      WHERE Id = :templateId
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('Template not found.');
    }
    DocEngine_Template__c head = rows[0];
    if (head.Current_Version__c != null) {
      return head.Current_Version__c;
    }

    Decimal versionNumber = head.Version__c == null ? 1 : head.Version__c;
    if (String.isBlank(head.Template_JSON__c)) {
      throw new AuraHandledException('Template has no Template_JSON__c to snapshot.');
    }

    String key = versionKey(templateId, versionNumber);
    List<DocEngine_Template_Version__c> existing = [
      SELECT Id
      FROM DocEngine_Template_Version__c
      WHERE Version_Key__c = :key
      LIMIT 1
    ];
    if (!existing.isEmpty()) {
      patchCurrentVersion(templateId, existing[0].Id, versionNumber, head.Template_JSON__c);
      return existing[0].Id;
    }

    DocEngine_Template_Version__c ver = insertVersion(templateId, versionNumber, head.Template_JSON__c);
    patchCurrentVersion(templateId, ver.Id, versionNumber, head.Template_JSON__c);
    return ver.Id;
  }

  public static DocEngine_Template_Version__c insertVersion(
    Id templateId,
    Decimal versionNumber,
    String templateJson
  ) {
    DocEngine_Template_Version__c ver = new DocEngine_Template_Version__c();
    ver.Template__c = templateId;
    ver.Version__c = versionNumber;
    ver.Template_JSON__c = templateJson;
    ver.Version_Key__c = versionKey(templateId, versionNumber);
    try {
      insert ver;
      return ver;
    } catch (DmlException e) {
      String key = versionKey(templateId, versionNumber);
      List<DocEngine_Template_Version__c> existing = [
        SELECT Id, Version__c, Template_JSON__c
        FROM DocEngine_Template_Version__c
        WHERE Version_Key__c = :key
        LIMIT 1
      ];
      if (!existing.isEmpty()) {
        return existing[0];
      }
      throw new AuraHandledException(formatDmlMessage(e));
    }
  }

  private static void patchCurrentVersion(
    Id templateId,
    Id versionId,
    Decimal versionNumber,
    String templateJson
  ) {
    update new DocEngine_Template__c(
      Id = templateId,
      Current_Version__c = versionId,
      Version__c = versionNumber,
      Template_JSON__c = templateJson
    );
  }

  public static String versionKey(Id templateId, Decimal versionNumber) {
    return String.valueOf(templateId) + '_' + String.valueOf(versionNumber.intValue());
  }

  private static String formatDmlMessage(DmlException e) {
    if (e == null) {
      return 'Database error.';
    }
    if (e.getNumDml() > 0 && String.isNotBlank(e.getDmlMessage(0))) {
      return e.getDmlMessage(0);
    }
    return String.isNotBlank(e.getMessage()) ? e.getMessage() : 'Database error.';
  }
}
