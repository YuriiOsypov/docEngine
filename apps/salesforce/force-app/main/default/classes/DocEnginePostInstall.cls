/**
 * Runs on managed package install / upgrade.
 * Seeds org defaults, assigns DocEngine_Admin to the installer, and on first install
 * creates a starter Account template + Generate Document button config.
 */
global without sharing class DocEnginePostInstall implements InstallHandler {
  private static final String ADMIN_PERM_SET = 'DocEngine_Admin';
  private static final String STARTER_TEMPLATE_NAME = 'Getting Started (Account)';
  private static final String STARTER_BUTTON_NAME = 'Account Generate Document';
  private static final String STARTER_DEV_NAME = 'Account_Generate_Document';
  private static final String STARTER_TEMPLATE_JSON =
    '{"kind":"template","version":2,"fieldSchemas":{},"blocks":[{"type":"paragraph","data":{"text":"Welcome to DocEngine. Open the DocEngine app to edit this template, then use Generate Document on Account records."}}]}';

  global void onInstall(InstallContext context) {
    seedSettings();
    assignAdminToInstaller(context);
    if (context != null && !context.isUpgrade()) {
      seedStarterAccountTemplate();
    }
    syncTemplateShares();
  }

  /**
   * Callable after unmanaged deploy/install when InstallHandler does not run.
   * Seeds settings, starter Account template + button config, and assigns DocEngine_Admin to the current user.
   */
  global static void runFirstTimeSetup() {
    // Explicit user-mode profile check is safe; InstallHandler must remain without sharing.
    // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
    List<Profile> callerProfiles = [
      SELECT PermissionsModifyAllData
      FROM Profile
      WHERE Id = :UserInfo.getProfileId()
      WITH USER_MODE
      LIMIT 1
    ];
    // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    if (callerProfiles.isEmpty() || callerProfiles[0].PermissionsModifyAllData != true) {
      throw new SecurityException('Modify All Data is required to run DocEngine setup.');
    }
    seedSettings();
    seedStarterAccountTemplate();
    assignAdminToUserId(UserInfo.getUserId());
    syncTemplateShares();
  }

  @TestVisible
  private static void seedSettings() {
    DocEngine_Settings__c settings = DocEngine_Settings__c.getOrgDefaults();
    if (settings.Id == null) {
      settings.Use_External_PDF__c = false;
      // Install bootstrap must initialize package hierarchy settings in system mode.
      // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
      Database.upsert(settings, AccessLevel.SYSTEM_MODE);
      // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    }
  }

  @TestVisible
  private static void assignAdminToInstaller(InstallContext context) {
    if (context == null) {
      return;
    }
    assignAdminToUserId(context.installerId());
  }

  @TestVisible
  private static void assignAdminToUserId(Id userId) {
    if (userId == null) {
      return;
    }
    // Installer bootstrap intentionally reads package metadata in system mode.
    // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
    List<PermissionSet> permSets = Database.queryWithBinds(
      'SELECT Id FROM PermissionSet WHERE Name = :permissionSetName LIMIT 1',
      new Map<String, Object>{ 'permissionSetName' => ADMIN_PERM_SET },
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    if (permSets.isEmpty()) {
      return;
    }
    Id permSetId = permSets[0].Id;
    // Install bootstrap must detect package permission assignment in system mode.
    // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
    List<AggregateResult> assignmentCounts = Database.queryWithBinds(
      'SELECT COUNT(Id) total FROM PermissionSetAssignment ' +
        'WHERE AssigneeId = :assigneeId AND PermissionSetId = :permissionSetId',
      new Map<String, Object>{
        'assigneeId' => userId,
        'permissionSetId' => permSetId
      },
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    Integer existing = (Integer) assignmentCounts[0].get('total');
    if (existing > 0) {
      return;
    }
    // Installer-authorized permission assignment is a required system bootstrap operation.
    // Code-analyzer-suppress(sfge:ApexFlsViolation,sfge:DatabaseOperationsMustUseWithSharing)
    Database.insert(
      new PermissionSetAssignment(AssigneeId = userId, PermissionSetId = permSetId),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation,sfge:DatabaseOperationsMustUseWithSharing)
  }

  @TestVisible
  private static void seedStarterAccountTemplate() {
    // Install bootstrap must inspect all package templates in system mode.
    // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
    List<AggregateResult> templateCounts = Database.queryWithBinds(
      'SELECT COUNT(Id) total FROM DocEngine_Template__c',
      new Map<String, Object>(),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    if ((Integer) templateCounts[0].get('total') > 0) {
      return;
    }
    DocEngine_Template__c template = new DocEngine_Template__c(
      Name = STARTER_TEMPLATE_NAME,
      Object_API_Name__c = 'Account',
      Is_Active__c = true,
      Template_JSON__c = STARTER_TEMPLATE_JSON,
      Version__c = 1,
      Description__c = 'Sample template created on install. Edit or replace in the DocEngine app.'
    );
    // First-install seed data requires system access to package fields unavailable through subscriber FLS.
    // Code-analyzer-suppress(sfge:ApexFlsViolation,sfge:DatabaseOperationsMustUseWithSharing)
    Database.insert(template, AccessLevel.SYSTEM_MODE);
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation,sfge:DatabaseOperationsMustUseWithSharing)

    // Install bootstrap must inspect all package button configurations in system mode.
    // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
    List<AggregateResult> buttonCounts = Database.queryWithBinds(
      'SELECT COUNT(Id) total FROM DocEngine_Button_Config__c',
      new Map<String, Object>(),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    if ((Integer) buttonCounts[0].get('total') > 0) {
      return;
    }
    // First-install seed data requires system access to package fields unavailable through subscriber FLS.
    // Code-analyzer-suppress(sfge:ApexFlsViolation,sfge:DatabaseOperationsMustUseWithSharing)
    Database.insert(
      new DocEngine_Button_Config__c(
        Name = STARTER_BUTTON_NAME,
        Developer_Name__c = STARTER_DEV_NAME,
        Template__c = template.Id,
        Fill_Mode__c = true,
        Export_Mode__c = 'pdf',
        Show_Preview__c = true,
        Attach_To_Record__c = true
      ),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation,sfge:DatabaseOperationsMustUseWithSharing)
  }

  @TestVisible
  private static void syncTemplateShares() {
    // Upgrade reconciliation intentionally covers every package template.
    // Code-analyzer-suppress(sfge:DatabaseOperationsMustUseWithSharing)
    List<DocEngine_Template__c> templates = Database.queryWithBinds(
      'SELECT Id FROM DocEngine_Template__c',
      new Map<String, Object>(),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:DatabaseOperationsMustUseWithSharing)
    for (DocEngine_Template__c template : templates) {
      DocEngineTemplateSharingService.syncTemplate(template.Id);
    }
  }
}
