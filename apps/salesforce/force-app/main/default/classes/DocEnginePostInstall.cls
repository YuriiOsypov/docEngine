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
  }

  /**
   * Callable after unmanaged deploy/install when InstallHandler does not run.
   * Seeds settings, starter Account template + button config, and assigns DocEngine_Admin to the current user.
   */
  global static void runFirstTimeSetup() {
    seedSettings();
    seedStarterAccountTemplate();
    assignAdminToUserId(UserInfo.getUserId());
  }

  @TestVisible
  private static void seedSettings() {
    DocEngine_Settings__c settings = DocEngine_Settings__c.getOrgDefaults();
    if (settings.Id == null) {
      settings.Use_External_PDF__c = false;
      upsert settings;
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
    List<PermissionSet> permSets = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = :ADMIN_PERM_SET
      LIMIT 1
    ];
    if (permSets.isEmpty()) {
      return;
    }
    Id permSetId = permSets[0].Id;
    Integer existing = [
      SELECT COUNT()
      FROM PermissionSetAssignment
      WHERE AssigneeId = :userId AND PermissionSetId = :permSetId
    ];
    if (existing > 0) {
      return;
    }
    insert new PermissionSetAssignment(AssigneeId = userId, PermissionSetId = permSetId);
  }

  @TestVisible
  private static void seedStarterAccountTemplate() {
    if ([SELECT COUNT() FROM DocEngine_Template__c LIMIT 1] > 0) {
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
    insert template;

    if ([SELECT COUNT() FROM DocEngine_Button_Config__c LIMIT 1] > 0) {
      return;
    }
    insert new DocEngine_Button_Config__c(
      Name = STARTER_BUTTON_NAME,
      Developer_Name__c = STARTER_DEV_NAME,
      Template__c = template.Id,
      Fill_Mode__c = true,
      Export_Mode__c = 'pdf',
      Show_Preview__c = true,
      Attach_To_Record__c = true
    );
  }
}
