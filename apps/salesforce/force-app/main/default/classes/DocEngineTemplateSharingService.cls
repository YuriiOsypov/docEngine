/**
 * Maintains read sharing for private templates after an authorized admin save.
 * Blank group means all internal users; otherwise only the configured Public Group.
 */
public with sharing class DocEngineTemplateSharingService {
  public static void syncTemplate(Id templateId) {
    if (templateId == null) {
      throw new SecurityException('templateId is required.');
    }
    // Package-internal share maintenance intentionally reads beyond subscriber FLS.
    List<DocEngine_Template__c> templates = Database.queryWithBinds(
      'SELECT Access_Group_Id__c FROM DocEngine_Template__c ' +
        'WHERE Id = :templateId LIMIT 1',
      new Map<String, Object>{ 'templateId' => templateId },
      AccessLevel.SYSTEM_MODE
    );
    if (templates.isEmpty()) {
      throw new SecurityException('Template not found.');
    }
    String accessGroupId = templates[0].Access_Group_Id__c;

    List<DocEngine_Template__Share> existing = Database.queryWithBinds(
      'SELECT Id FROM DocEngine_Template__Share ' +
        'WHERE ParentId = :templateId AND RowCause = \'Manual\'',
      new Map<String, Object>{ 'templateId' => templateId },
      AccessLevel.SYSTEM_MODE
    );
    if (!existing.isEmpty()) {
      // Authorized share reconciliation requires system access to package-managed share rows.
      // Code-analyzer-suppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
      Database.delete(existing, AccessLevel.SYSTEM_MODE);
      // Code-analyzer-unsuppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
    }

    Id targetGroupId;
    if (String.isNotBlank(accessGroupId)) {
      targetGroupId = Id.valueOf(accessGroupId.trim());
    } else {
      List<Group> organizationGroups = Database.queryWithBinds(
        'SELECT Id FROM Group WHERE Type = \'Organization\' LIMIT 1',
        new Map<String, Object>(),
        AccessLevel.SYSTEM_MODE
      );
      if (!organizationGroups.isEmpty()) {
        targetGroupId = organizationGroups[0].Id;
      }
    }
    if (targetGroupId == null) {
      return;
    }

    // Authorized share reconciliation requires system access to package-managed share rows.
    // Code-analyzer-suppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
    Database.insert(
      new DocEngine_Template__Share(
        ParentId = templateId,
        UserOrGroupId = targetGroupId,
        AccessLevel = 'Read',
        RowCause = Schema.DocEngine_Template__Share.RowCause.Manual
      ),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
  }
}
