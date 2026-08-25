@IsTest
private class DocEngineAccessTest {
  @IsTest
  static void blankGroupAllowsAccess() {
    DocEngineAccess.clearCache();
    System.assertEquals(true, DocEngineAccess.canAccessByGroup(null));
    System.assertEquals(true, DocEngineAccess.canAccessByGroup(''));
    DocEngineAccess.assertGroupAccess(null);
  }

  @IsTest
  static void assertTemplateAccessAllowsOpenTemplate() {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Open',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = true,
      Version__c = 1
    );
    insert t;

    DocEngineAccess.clearCache();
    Test.startTest();
    DocEngineAccess.assertTemplateAccess(t.Id);
    Test.stopTest();
  }

  @IsTest
  static void assertTemplateAccessHonorsMembership() {
    Group g;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      g = new Group(Name = 'DocEngine Access Gate', Type = 'Regular');
      insert g;
      insert new GroupMember(GroupId = g.Id, UserOrGroupId = UserInfo.getUserId());
    }

    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Restricted',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = true,
      Version__c = 1,
      Access_Group_Id__c = String.valueOf(g.Id)
    );
    insert t;

    DocEngineAccess.clearCache();
    DocEngineAccess.assertTemplateAccess(t.Id);
    System.assertEquals(true, DocEngineAccess.canAccessByGroup(String.valueOf(g.Id)));
  }

  @IsTest
  static void documentInheritsTemplateGroup() {
    Group g;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      g = new Group(Name = 'DocEngine Doc Inherit', Type = 'Regular');
      insert g;
      insert new GroupMember(GroupId = g.Id, UserOrGroupId = UserInfo.getUserId());
    }

    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Parent T',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{}',
      Is_Active__c = true,
      Version__c = 1,
      Access_Group_Id__c = String.valueOf(g.Id)
    );
    insert t;

    Account a = new Account(Name = 'Acme');
    insert a;

    DocEngine_Document__c doc = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = String.valueOf(a.Id),
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Draft'
    );
    insert doc;

    DocEngineAccess.clearCache();
    Test.startTest();
    DocEngineAccess.assertDocumentAccess(doc.Id);
    Test.stopTest();
  }

  @IsTest
  static void nestedPublicGroupMembershipCounts() {
    Group parent;
    Group child;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      parent = new Group(Name = 'DocEngine Parent PG', Type = 'Regular');
      child = new Group(Name = 'DocEngine Child PG', Type = 'Regular');
      insert new List<Group>{ parent, child };
      insert new GroupMember(GroupId = parent.Id, UserOrGroupId = child.Id);
      insert new GroupMember(GroupId = child.Id, UserOrGroupId = UserInfo.getUserId());
    }

    DocEngineAccess.clearCache();
    Set<String> ids = DocEngineAccess.currentUserPublicGroupIds();
    System.assert(
      ids.contains(String.valueOf(child.Id)),
      'Expected direct child Public Group'
    );
    System.assert(
      ids.contains(String.valueOf(parent.Id)),
      'Expected nested parent Public Group via GroupMember expansion'
    );
  }
}
