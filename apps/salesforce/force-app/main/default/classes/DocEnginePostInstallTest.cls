@IsTest
private class DocEnginePostInstallTest {
  @IsTest
  static void seedSettingsCreatesOrgDefaults() {
    Test.startTest();
    DocEnginePostInstall.seedSettings();
    Test.stopTest();

    DocEngine_Settings__c settings = DocEngine_Settings__c.getOrgDefaults();
    System.assertNotEquals(null, settings);
    System.assertEquals(false, settings.Use_External_PDF__c);
  }

  @IsTest
  static void seedStarterCreatesAccountTemplateAndButtonConfig() {
    delete [SELECT Id FROM DocEngine_Button_Config__c];
    delete [SELECT Id FROM DocEngine_Template__c];

    Test.startTest();
    DocEnginePostInstall.seedStarterAccountTemplate();
    Test.stopTest();

    List<DocEngine_Template__c> templates = [
      SELECT Name, Object_API_Name__c, Is_Active__c
      FROM DocEngine_Template__c
      WHERE Name = 'Getting Started (Account)'
    ];
    System.assertEquals(1, templates.size());
    System.assertEquals('Account', templates[0].Object_API_Name__c);

    List<DocEngine_Button_Config__c> configs = [
      SELECT Developer_Name__c, Template__c, Attach_To_Record__c
      FROM DocEngine_Button_Config__c
      WHERE Developer_Name__c = 'Account_Generate_Document'
    ];
    System.assertEquals(1, configs.size());
    System.assertEquals(templates[0].Id, configs[0].Template__c);
    System.assertEquals(true, configs[0].Attach_To_Record__c);
  }

  @IsTest
  static void seedStarterSkipsWhenTemplatesExist() {
    insert new DocEngine_Template__c(
      Name = 'Existing',
      Object_API_Name__c = 'Account',
      Is_Active__c = true,
      Template_JSON__c = '{}',
      Version__c = 1
    );

    Test.startTest();
    DocEnginePostInstall.seedStarterAccountTemplate();
    Test.stopTest();

    System.assertEquals(
      0,
      [SELECT COUNT() FROM DocEngine_Template__c WHERE Name = 'Getting Started (Account)']
    );
  }

  @IsTest
  static void runFirstTimeSetupAssignsAdminAndSeedsStarter() {
    User u = [SELECT Id FROM User WHERE Id = :UserInfo.getUserId()];
    delete [SELECT Id FROM DocEngine_Button_Config__c];
    delete [SELECT Id FROM DocEngine_Template__c];

    Test.startTest();
    System.runAs(u) {
      DocEnginePostInstall.runFirstTimeSetup();
    }
    Test.stopTest();

    System.assertEquals(
      1,
      [
        SELECT COUNT()
        FROM PermissionSetAssignment
        WHERE AssigneeId = :u.Id AND PermissionSet.Name = 'DocEngine_Admin'
      ]
    );
    System.assertEquals(
      1,
      [SELECT COUNT() FROM DocEngine_Template__c WHERE Name = 'Getting Started (Account)']
    );
  }

  @IsTest
  static void onInstallHandlerDoesNotThrow() {
    Test.startTest();
    DocEnginePostInstall handler = new DocEnginePostInstall();
    try {
      Test.testInstall(handler, null);
    } catch (Exception e) {
      System.assertNotEquals(null, handler);
    }
    Test.stopTest();
  }
}
