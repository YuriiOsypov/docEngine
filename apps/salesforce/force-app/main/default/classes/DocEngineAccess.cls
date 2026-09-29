/**
 * Central Public Group access checks for DocEngine templates and related records.
 * UI filtering alone is not enough — all Apex entry points that return template
 * payload / merge data / documents must call assert* here.
 */
public with sharing class DocEngineAccess {
  private static final Integer GROUP_EXPAND_MAX_DEPTH = 8;
  private static final String DENY_MESSAGE = 'You do not have access to this template.';

  @TestVisible
  private static Set<String> cachedUserPublicGroupIds;
  @TestVisible
  private static Boolean cachedHasViewAllTemplates;

  /**
   * Administrative configuration must not rely on object CRUD alone because
   * subscriber profiles can grant CRUD independently of DocEngine.
   */
  public static void assertManageAccess() {
    if (FeatureManagement.checkPermission('Manage_DocEngine')) {
      return;
    }
    List<Profile> profiles = [
      SELECT PermissionsModifyAllData
      FROM Profile
      WHERE Id = :UserInfo.getProfileId()
      WITH USER_MODE
      LIMIT 1
    ];
    if (profiles.isEmpty() || profiles[0].PermissionsModifyAllData != true) {
      throw new AuraHandledException('DocEngine Admin permission is required.');
    }
  }

  /**
   * Throws if the running user may not use the template (Public Group restriction).
   * Users with View All Records on DocEngine_Template__c bypass the group check.
   */
  public static void assertTemplateAccess(Id templateId) {
    if (templateId == null) {
      throw new AuraHandledException('templateId is required.');
    }
    List<DocEngine_Template__c> rows = [
      SELECT Access_Group_Id__c
      FROM DocEngine_Template__c
      WHERE Id = :templateId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('Template not found.');
    }
    assertGroupAccess(rows[0].Access_Group_Id__c);
  }

  /**
   * Throws if Access_Group_Id__c is set and the user is not a (nested) member.
   */
  public static void assertGroupAccess(String accessGroupId) {
    if (!canAccessByGroup(accessGroupId)) {
      throw new AuraHandledException(DENY_MESSAGE);
    }
  }

  /**
   * Document inherits restriction from its Template__c Public Group.
   */
  public static void assertDocumentAccess(Id documentId) {
    if (documentId == null) {
      throw new AuraHandledException('documentId is required.');
    }
    List<DocEngine_Document__c> rows = [
      SELECT Template__r.Access_Group_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :documentId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('Document instance not found.');
    }
    String groupId = rows[0].Template__r != null
      ? rows[0].Template__r.Access_Group_Id__c
      : null;
    assertGroupAccess(groupId);
  }

  public static Boolean canAccessByGroup(String accessGroupId) {
    if (String.isBlank(accessGroupId)) {
      return true;
    }
    if (hasViewAllTemplates()) {
      return true;
    }
    return currentUserPublicGroupIds().contains(accessGroupId.trim());
  }

  /**
   * Public Group Ids the running user belongs to, including nested Regular groups
   * (Group A member of Group B → user in A can satisfy Access_Group_Id = B).
   */
  public static Set<String> currentUserPublicGroupIds() {
    if (cachedUserPublicGroupIds != null) {
      return cachedUserPublicGroupIds;
    }
    Set<String> regularIds = new Set<String>();
    Set<Id> processedGroupIds = new Set<Id>();
    Set<Id> frontier = new Set<Id>{ UserInfo.getUserId() };

    for (Integer depth = 0; depth < GROUP_EXPAND_MAX_DEPTH && !frontier.isEmpty(); depth++) {
      List<GroupMember> members = [
        SELECT GroupId, Group.Type
        FROM GroupMember
        WHERE UserOrGroupId IN :frontier
        WITH USER_MODE
      ];
      Set<Id> nextFrontier = new Set<Id>();
      for (GroupMember gm : members) {
        if (gm.GroupId == null || processedGroupIds.contains(gm.GroupId)) {
          continue;
        }
        processedGroupIds.add(gm.GroupId);
        nextFrontier.add(gm.GroupId);
        if (gm.Group != null && gm.Group.Type == 'Regular') {
          regularIds.add(String.valueOf(gm.GroupId));
        }
      }
      frontier = nextFrontier;
    }

    cachedUserPublicGroupIds = regularIds;
    return cachedUserPublicGroupIds;
  }

  public static Boolean hasViewAllTemplates() {
    if (cachedHasViewAllTemplates != null) {
      return cachedHasViewAllTemplates;
    }
    // Packaging / namespaced orgs store ObjectPermissions.SObjectType with the prefix
    // (e.g. logicomapp__DocEngine_Template__c); local describe name is always correct.
    String templateTypeName = DocEngine_Template__c.SObjectType.getDescribe().getName();
    List<PermissionSetAssignment> assignments = [
      SELECT Id
      FROM PermissionSetAssignment
      WHERE AssigneeId = :UserInfo.getUserId()
        AND PermissionSetId IN (
          SELECT ParentId
          FROM ObjectPermissions
          WHERE SObjectType = :templateTypeName AND PermissionsViewAllRecords = true
        )
      WITH USER_MODE
      LIMIT 1
    ];
    cachedHasViewAllTemplates = !assignments.isEmpty();
    return cachedHasViewAllTemplates;
  }

  @TestVisible
  private static void clearCache() {
    cachedUserPublicGroupIds = null;
    cachedHasViewAllTemplates = null;
  }
}
