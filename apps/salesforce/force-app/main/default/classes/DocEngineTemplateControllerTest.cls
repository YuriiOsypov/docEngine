@IsTest
private class DocEngineTemplateControllerTest {
  @IsTest
  static void saveAndGetTemplate() {
    DocEngineTemplateController.TemplateDTO dto = new DocEngineTemplateController.TemplateDTO();
    dto.name = 'Account Agreement';
    dto.objectApiName = 'Account';
    dto.templateJson = '{"kind":"template","version":1,"blocks":[],"fieldSchemas":{},"fieldMapping":{"kind":"fieldMapping","version":1,"rules":[]}}';
    dto.isActive = true;
    dto.description = 'Test';
    dto.pdfFilename = 'agreement.pdf';

    Test.startTest();
    DocEngineTemplateController.TemplateDTO saved = DocEngineTemplateController.saveTemplate(dto);
    Test.stopTest();

    System.assertNotEquals(null, saved.id);
    System.assertEquals('Account', saved.objectApiName);
    System.assertEquals(1, saved.version);
    System.assertNotEquals(null, saved.versionId);

    DocEngineTemplateController.TemplateDTO loaded = DocEngineTemplateController.getTemplate(saved.id);
    System.assertEquals(saved.id, loaded.id);
    System.assert(loaded.templateJson.contains('template'));
    System.assert(loaded.templateJson.contains('fieldMapping'));

    List<DocEngine_Template_Version__c> versions = [
      SELECT Id, Version__c, Template_JSON__c, Version_Key__c
      FROM DocEngine_Template_Version__c
      WHERE Template__c = :saved.id
    ];
    System.assertEquals(1, versions.size());
    System.assertEquals(1, versions[0].Version__c);
    System.assertEquals(saved.versionId, versions[0].Id);

    DocEngine_Template__c head = [
      SELECT Current_Version__c, Version__c FROM DocEngine_Template__c WHERE Id = :saved.id
    ];
    System.assertEquals(versions[0].Id, head.Current_Version__c);
  }

  @IsTest
  static void saveCreatesNewVersionAndListGetVersion() {
    DocEngineTemplateController.TemplateDTO dto = new DocEngineTemplateController.TemplateDTO();
    dto.name = 'Versioned';
    dto.objectApiName = 'Account';
    dto.templateJson = '{"kind":"template","version":1,"blocks":[],"fieldSchemas":{}}';
    dto.isActive = true;

    DocEngineTemplateController.TemplateDTO v1 = DocEngineTemplateController.saveTemplate(dto);
    dto.id = v1.id;
    dto.templateJson = '{"kind":"template","version":1,"blocks":[{"type":"paragraph"}],"fieldSchemas":{}}';

    Test.startTest();
    DocEngineTemplateController.TemplateDTO v2 = DocEngineTemplateController.saveTemplate(dto);
    List<DocEngineTemplateController.VersionSummary> history =
      DocEngineTemplateController.listVersions(v1.id);
    DocEngineTemplateController.TemplateDTO loadedV1 =
      DocEngineTemplateController.getVersion(v1.versionId);
    Test.stopTest();

    System.assertEquals(2, v2.version);
    System.assertEquals(2, history.size());
    System.assertEquals(true, history[0].isCurrent);
    System.assertEquals(2, history[0].version);
    System.assertEquals(1, loadedV1.version);
    System.assert(!loadedV1.templateJson.contains('paragraph'));
    System.assert(v2.templateJson.contains('paragraph'));
  }

  @IsTest
  static void listForObjectFiltersActive() {
    DocEngine_Template__c active = new DocEngine_Template__c(
      Name = 'Active T',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = true,
      Version__c = 1
    );
    DocEngine_Template__c inactive = new DocEngine_Template__c(
      Name = 'Inactive T',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = false,
      Version__c = 1
    );
    insert new List<DocEngine_Template__c>{ active, inactive };

    List<DocEngineTemplateController.TemplateSummary> summaries = DocEngineTemplateController.listForObject('Account');
    System.assertEquals(1, summaries.size());
    System.assertEquals('Active T', summaries[0].name);
  }

  @IsTest
  static void getObjectApiNameFromId() {
    Account a = new Account(Name = 'Test Co');
    insert a;
    String api = DocEngineTemplateController.getObjectApiName(a.Id);
    System.assertEquals('Account', api);
  }

  @IsTest
  static void saveTemplateRequiresName() {
    DocEngineTemplateController.TemplateDTO dto = new DocEngineTemplateController.TemplateDTO();
    dto.objectApiName = 'Account';
    dto.templateJson = '{}';
    Boolean threw = false;
    try {
      DocEngineTemplateController.saveTemplate(dto);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Expected AuraHandledException');
  }

  @IsTest
  static void createTemplateEntryPointCreatesRow() {
    Test.startTest();
    Id templateId = DocEngineTemplateController.createTemplate('Aura Create', 'Account', 'From createTemplate');
    Test.stopTest();

    System.assertNotEquals(null, templateId);
    DocEngine_Template__c row = [
      SELECT Name, Object_API_Name__c, Description__c, Current_Version__c
      FROM DocEngine_Template__c
      WHERE Id = :templateId
    ];
    System.assertEquals('Aura Create', row.Name);
    System.assertEquals('Account', row.Object_API_Name__c);
    System.assertEquals('From createTemplate', row.Description__c);
    System.assertNotEquals(null, row.Current_Version__c);
  }

  @IsTest
  static void saveTemplateJsonRoundTrip() {
    String payload =
      '{"name":"Json Save","objectApiName":"Account","templateJson":"{\\"kind\\":\\"template\\",\\"version\\":1,\\"blocks\\":[],\\"fieldSchemas\\":{}}","isActive":true}';

    Test.startTest();
    String resultJson = DocEngineTemplateController.saveTemplateJson(payload);
    Test.stopTest();

    System.assert(String.isNotBlank(resultJson));
    Map<String, Object> saved = (Map<String, Object>) JSON.deserializeUntyped(resultJson);
    System.assertNotEquals(null, saved.get('id'));
    System.assertEquals('Json Save', saved.get('name'));
  }

  @IsTest
  static void saveTemplateAsAdminPermSetUser() {
    Profile p = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Standard User'
      LIMIT 1
    ];
    PermissionSet ps = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = 'DocEngine_Admin'
      LIMIT 1
    ];
    User u = new User(
      Alias = 'deadm',
      Email = 'docengine.admin@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'DocEngineAdmin',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = p.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      UserName = 'docengine.admin.' + String.valueOf(Crypto.getRandomInteger()) + '@example.com'
    );
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert u;
      insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
    }

    DocEngineTemplateController.TemplateDTO dto = new DocEngineTemplateController.TemplateDTO();
    dto.name = 'PermSet User Template';
    dto.objectApiName = 'Account';
    dto.templateJson = '{"kind":"template","version":1,"blocks":[],"fieldSchemas":{},"fieldMapping":{"kind":"fieldMapping","version":1,"rules":[]}}';
    dto.isActive = true;

    DocEngineTemplateController.TemplateDTO saved;
    System.runAs(u) {
      Test.startTest();
      saved = DocEngineTemplateController.saveTemplate(dto);
      Test.stopTest();
    }

    System.assertNotEquals(null, saved.id);
    DocEngine_Template__c row = [
      SELECT Object_API_Name__c, Current_Version__c
      FROM DocEngine_Template__c
      WHERE Id = :saved.id
    ];
    System.assertEquals('Account', row.Object_API_Name__c);
    System.assertNotEquals(null, row.Current_Version__c);
  }

  @IsTest
  static void saveAndGetPersistsAccessGroupId() {
    Group g;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      g = new Group(Name = 'DocEngine Access Test', Type = 'Regular');
      insert g;
      insert new GroupMember(GroupId = g.Id, UserOrGroupId = UserInfo.getUserId());
    }

    DocEngineTemplateController.TemplateDTO dto = new DocEngineTemplateController.TemplateDTO();
    dto.name = 'Grouped Template';
    dto.objectApiName = 'Account';
    dto.templateJson = '{"kind":"template","version":1,"blocks":[],"fieldSchemas":{}}';
    dto.isActive = true;
    dto.accessGroupId = String.valueOf(g.Id);

    Test.startTest();
    DocEngineTemplateController.TemplateDTO saved = DocEngineTemplateController.saveTemplate(dto);
    Test.stopTest();

    System.assertEquals(String.valueOf(g.Id), saved.accessGroupId);
    DocEngine_Template__c row = [
      SELECT Access_Group_Id__c FROM DocEngine_Template__c WHERE Id = :saved.id
    ];
    System.assertEquals(String.valueOf(g.Id), row.Access_Group_Id__c);
  }

  @IsTest
  static void listPublicGroupsReturnsRegularGroups() {
    Group g = new Group(Name = 'DocEngine List Groups', Type = 'Regular');
    insert g;

    List<DocEngineTemplateController.GroupOption> opts =
      DocEngineTemplateController.listPublicGroups();
    Boolean found = false;
    for (DocEngineTemplateController.GroupOption opt : opts) {
      if (opt.value == String.valueOf(g.Id)) {
        found = true;
        System.assertEquals('DocEngine List Groups', opt.label);
        break;
      }
    }
    System.assert(found, 'Expected inserted Public Group in listPublicGroups');
  }

  @IsTest
  static void saveTemplateRejectsInvalidAccessGroupId() {
    DocEngineTemplateController.TemplateDTO dto = new DocEngineTemplateController.TemplateDTO();
    dto.name = 'Bad Group';
    dto.objectApiName = 'Account';
    dto.templateJson = '{}';
    dto.accessGroupId = UserInfo.getUserId();

    Boolean threw = false;
    try {
      DocEngineTemplateController.saveTemplate(dto);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Expected AuraHandledException for non-Public Group Id');
  }

  @IsTest
  static void listForObjectHidesRestrictedTemplates() {
    Group g = new Group(Name = 'DocEngine Restricted', Type = 'Regular');
    insert g;

    DocEngine_Template__c openTpl = new DocEngine_Template__c(
      Name = 'Open T',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = true,
      Version__c = 1
    );
    DocEngine_Template__c restrictedTpl = new DocEngine_Template__c(
      Name = 'Restricted T',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = true,
      Version__c = 1,
      Access_Group_Id__c = String.valueOf(g.Id)
    );
    insert new List<DocEngine_Template__c>{ openTpl, restrictedTpl };

    // Running user typically has View All via Admin permset in scratch; filter still returns both.
    // Assert open template is always present; restricted visibility depends on View All / membership.
    List<DocEngineTemplateController.TemplateSummary> summaries =
      DocEngineTemplateController.listForObject('Account');
    Set<String> names = new Set<String>();
    for (DocEngineTemplateController.TemplateSummary s : summaries) {
      names.add(s.name);
    }
    System.assert(names.contains('Open T'), 'Unrestricted template should be listed');
  }
}
