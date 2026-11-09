@IsTest
private class DocEngineTemplateVersionServiceTest {
  private static DocEngine_Template__c makeUnpinnedTemplate(String jsonBody) {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Version Pin',
      Object_API_Name__c = 'Account',
      Template_JSON__c = jsonBody,
      Is_Active__c = true,
      Version__c = 1
    );
    insert t;
    return t;
  }

  private static User makeDocEngineUser(String alias) {
    Profile p = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Standard User'
      LIMIT 1
    ];
    PermissionSet ps = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = 'DocEngine_User'
      LIMIT 1
    ];
    User u = new User(
      Alias = alias,
      Email = alias + '@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'DocEngineUser',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = p.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      UserName = alias + '.' + String.valueOf(Crypto.getRandomInteger()) + '@example.com'
    );
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert u;
      insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
    }
    return u;
  }

  @IsTest
  static void ensureCurrentVersionPinsHeadOnlySnapshot() {
    String headJson = '{"kind":"template","blocks":[{"type":"paragraph"}],"fieldSchemas":{}}';
    DocEngine_Template__c t = makeUnpinnedTemplate(headJson);

    Test.startTest();
    Id versionId = DocEngineTemplateVersionService.ensureCurrentVersionId(t.Id);
    Test.stopTest();

    System.assertNotEquals(null, versionId);
    DocEngine_Template_Version__c ver = [
      SELECT Template_JSON__c, Version__c, Template__c
      FROM DocEngine_Template_Version__c
      WHERE Id = :versionId
    ];
    System.assertEquals(t.Id, ver.Template__c);
    System.assertEquals(1, ver.Version__c);
    System.assertEquals(headJson, ver.Template_JSON__c);

    DocEngine_Template__c head = [
      SELECT Current_Version__c, Template_JSON__c, Version__c
      FROM DocEngine_Template__c
      WHERE Id = :t.Id
    ];
    System.assertEquals(versionId, head.Current_Version__c);
    System.assertEquals(headJson, head.Template_JSON__c);
    System.assertEquals(1, head.Version__c);

    Id again = DocEngineTemplateVersionService.ensureCurrentVersionId(t.Id);
    System.assertEquals(versionId, again, 'Second ensure must reuse pinned Current_Version');
  }

  @IsTest
  static void fillUserCanEnsureButNotInsertCallerJson() {
    DocEngine_Template__c t = makeUnpinnedTemplate(
      '{"kind":"template","blocks":[],"fieldSchemas":{}}'
    );
    User fillUser = makeDocEngineUser('devpin');

    Id pinned;
    System.runAs(fillUser) {
      Test.startTest();
      pinned = DocEngineTemplateVersionService.ensureCurrentVersionId(t.Id);
      Test.stopTest();
    }
    System.assertNotEquals(null, pinned);

    Boolean denied = false;
    System.runAs(fillUser) {
      try {
        DocEngineTemplateVersionService.insertVersion(
          t.Id,
          99,
          '{"kind":"template","evil":true}'
        );
      } catch (AuraHandledException e) {
        denied = true;
      } catch (SecurityException e) {
        denied = true;
      }
    }
    System.assert(denied, 'DocEngine_User must not insert caller-supplied version JSON');
    System.assertEquals(
      0,
      [
        SELECT COUNT()
        FROM DocEngine_Template_Version__c
        WHERE Template__c = :t.Id AND Version__c = 99
      ],
      'Crafted version row must not exist'
    );
  }
}
