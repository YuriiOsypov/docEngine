@IsTest
private class DocEngineInstanceControllerTest {
  private static DocEngine_Template__c makeTemplate() {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'T1',
      Object_API_Name__c = 'Account',
      Template_JSON__c = '{"kind":"template","blocks":[],"fieldSchemas":{}}',
      Is_Active__c = true,
      Version__c = 1,
      PDF_Filename__c = 'out.pdf'
    );
    insert t;
    return t;
  }

  @IsTest
  static void saveGetAndListInstance() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;

    DocEngineInstanceController.InstanceDTO dto = new DocEngineInstanceController.InstanceDTO();
    dto.templateId = t.Id;
    dto.recordId = a.Id;
    dto.objectApiName = 'Account';
    dto.documentJson = '{"kind":"field","version":2,"time":1,"sections":{}}';
    dto.status = 'Draft';

    Test.startTest();
    DocEngineInstanceController.InstanceDTO saved = DocEngineInstanceController.saveInstance(dto);
    Test.stopTest();

    System.assertNotEquals(null, saved.id);
    System.assertEquals('Draft', saved.status);
    System.assertNotEquals(null, saved.templateVersionId);
    System.assert(saved.documentJson.contains('"kind":"field"') || saved.documentJson.contains('field'));

    // JSON entry point used by LWCs (avoids Aura nested-DTO GACKs).
    String jsonSavedRaw = DocEngineInstanceController.saveInstanceJson(
      JSON.serialize(
        new Map<String, Object>{
          'id' => saved.id,
          'templateId' => t.Id,
          'templateVersionId' => saved.templateVersionId,
          'recordId' => a.Id,
          'objectApiName' => 'Account',
          'documentJson' => '{"kind":"field","version":2,"time":2,"sections":{}}',
          'status' => 'Draft'
        }
      )
    );
    Map<String, Object> jsonSaved = (Map<String, Object>) JSON.deserializeUntyped(jsonSavedRaw);
    System.assertEquals(String.valueOf(saved.id), String.valueOf(jsonSaved.get('id')));
    System.assertEquals('Draft', (String) jsonSaved.get('status'));

    DocEngineInstanceController.InstanceDTO loaded = DocEngineInstanceController.getInstance(saved.id);
    System.assertEquals(saved.id, loaded.id);
    System.assertEquals(saved.templateVersionId, loaded.templateVersionId);
    System.assertEquals(1, loaded.templateVersion);
    System.assert(String.isNotBlank(loaded.templateJson));

    // Re-save must keep the same pinned version.
    loaded.documentJson = '{"kind":"field","version":2,"time":1,"sections":{}}';
    DocEngineInstanceController.InstanceDTO again = DocEngineInstanceController.saveInstance(loaded);
    System.assertEquals(saved.templateVersionId, again.templateVersionId);
    System.assert(again.documentJson.contains('"kind":"field"'));

    List<DocEngineInstanceController.InstanceSummary> summaries = DocEngineInstanceController.listForRecord(a.Id);
    System.assertEquals(1, summaries.size());
  }

  @IsTest
  static void savePdfAttachesFile() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;

    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{"kind":"document","blocks":[]}',
      Status__c = 'Draft'
    );
    insert inst;

    // Minimal PDF header bytes
    Blob pdf = Blob.valueOf('%PDF-1.4 fake');

    Test.startTest();
    DocEngineInstanceController.PdfSaveResult result = DocEngineInstanceController.savePdfFromBlob(
      inst.Id,
      pdf,
      'test.pdf'
    );
    Test.stopTest();

    System.assertNotEquals(null, result.contentVersionId);
    System.assertNotEquals(null, result.contentDocumentId);

    List<ContentDocumentLink> links = [
      SELECT Id
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :a.Id AND ContentDocumentId = :result.contentDocumentId
    ];
    System.assertEquals(1, links.size());

    DocEngine_Document__c updated = [
      SELECT Content_Document_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :inst.Id
    ];
    System.assertEquals(String.valueOf(result.contentDocumentId), updated.Content_Document_Id__c);
  }

  @IsTest
  static void saveHtmlRevisesExistingFile() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;

    String b64v1 = EncodingUtil.base64Encode(Blob.valueOf('<html><body>v1</body></html>'));
    DocEngineInstanceController.FileSaveResult first = DocEngineInstanceController.saveHtml(
      inst.Id,
      b64v1,
      'letter'
    );

    String b64v2 = EncodingUtil.base64Encode(Blob.valueOf('<html><body>v2</body></html>'));
    Test.startTest();
    DocEngineInstanceController.FileSaveResult second = DocEngineInstanceController.saveHtml(
      inst.Id,
      b64v2,
      'letter'
    );
    Test.stopTest();

    System.assertEquals(first.contentDocumentId, second.contentDocumentId);
    System.assertNotEquals(first.contentVersionId, second.contentVersionId);

    DocEngine_Document__c updated = [
      SELECT Content_Document_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :inst.Id
    ];
    System.assertEquals(String.valueOf(first.contentDocumentId), updated.Content_Document_Id__c);

    Integer versionCount = [
      SELECT COUNT()
      FROM ContentVersion
      WHERE ContentDocumentId = :first.contentDocumentId
    ];
    System.assertEquals(2, versionCount);

    List<ContentDocumentLink> links = [
      SELECT Id
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :a.Id AND ContentDocumentId = :first.contentDocumentId
    ];
    System.assertEquals(1, links.size(), 'source record should keep a single file link');

    List<DocEngineInstanceController.InstanceSummary> summaries = DocEngineInstanceController.listForRecord(
      a.Id
    );
    System.assertEquals(1, summaries.size());
    System.assertEquals(String.valueOf(first.contentDocumentId), summaries[0].contentDocumentId);
    System.assert(
      summaries[0].fileUrl != null && summaries[0].fileUrl.contains(String.valueOf(first.contentDocumentId)),
      'list should expose preview URL'
    );
  }

  @IsTest
  static void saveHtmlAttachesFile() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;

    String b64 = EncodingUtil.base64Encode(Blob.valueOf('<html><body>Hi</body></html>'));
    Test.startTest();
    DocEngineInstanceController.FileSaveResult result = DocEngineInstanceController.saveHtml(
      inst.Id,
      b64,
      'letter'
    );
    Test.stopTest();

    System.assertNotEquals(null, result.contentDocumentId);
    List<ContentDocumentLink> links = [
      SELECT Id
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :a.Id AND ContentDocumentId = :result.contentDocumentId
    ];
    System.assertEquals(1, links.size());
  }

  @IsTest
  static void prepareShareAttachesFile() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;

    String b64 = EncodingUtil.base64Encode(Blob.valueOf('<html><body>Share</body></html>'));
    Test.startTest();
    DocEngineInstanceController.SharePrepareResult result = DocEngineInstanceController.prepareShare(
      inst.Id,
      b64,
      'letter.html',
      'html'
    );
    Test.stopTest();

    System.assertNotEquals(null, result.contentDocumentId);
    System.assertNotEquals(null, result.contentVersionId);
    System.assertEquals('letter.html', result.filename);
    ContentDistribution distribution = [
      SELECT PreferencesAllowOriginalDownload, PreferencesExpires, ExpiryDate
      FROM ContentDistribution
      WHERE ContentVersionId = :result.contentVersionId
      LIMIT 1
    ];
    System.assertEquals(
      false,
      distribution.PreferencesAllowOriginalDownload,
      'public share must disable original download'
    );
    System.assertEquals(true, distribution.PreferencesExpires);
    System.assertNotEquals(null, distribution.ExpiryDate);
    List<ContentDocumentLink> links = [
      SELECT Id
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :a.Id AND ContentDocumentId = :result.contentDocumentId
    ];
    System.assertEquals(1, links.size());
  }

  @IsTest
  static void sendShareEmailRequiresRecipient() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;
    DocEngineInstanceController.FileSaveResult file = DocEngineInstanceController.saveHtml(
      inst.Id,
      EncodingUtil.base64Encode(Blob.valueOf('<html></html>')),
      'x.html'
    );

    Boolean threw = false;
    try {
      DocEngineInstanceController.sendShareEmail(
        file.contentVersionId,
        '',
        'Subj',
        'Body',
        false,
        inst.Id
      );
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assertEquals(true, threw, 'blank recipients should fail');
  }

  @IsTest
  static void sendShareEmailCreatesTaskWhenRequested() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;
    DocEngineInstanceController.FileSaveResult file = DocEngineInstanceController.saveHtml(
      inst.Id,
      EncodingUtil.base64Encode(Blob.valueOf('<html></html>')),
      'x.html'
    );

    Test.startTest();
    DocEngineInstanceController.sendShareEmail(
      file.contentVersionId,
      'buyer@example.com',
      'Quote attached',
      'Please review.',
      true,
      inst.Id
    );
    Test.stopTest();

    List<Task> tasks = [
      SELECT Id, Subject, WhatId, Status, Description
      FROM Task
      WHERE WhatId = :a.Id
    ];
    System.assertEquals(1, tasks.size(), 'expected one task on Account');
    System.assertEquals('Completed', tasks[0].Status);
    System.assert(tasks[0].Subject.startsWith('Email:'), tasks[0].Subject);
    System.assert(tasks[0].Description.contains('buyer@example.com'), tasks[0].Description);
  }

  @IsTest
  static void sendShareEmailSkipsTaskWhenUnchecked() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;
    DocEngineInstanceController.FileSaveResult file = DocEngineInstanceController.saveHtml(
      inst.Id,
      EncodingUtil.base64Encode(Blob.valueOf('<html></html>')),
      'x.html'
    );

    Test.startTest();
    DocEngineInstanceController.sendShareEmail(
      file.contentVersionId,
      'buyer@example.com',
      'Quote attached',
      'Please review.',
      false,
      inst.Id
    );
    Test.stopTest();

    Integer taskCount = [SELECT COUNT() FROM Task WHERE WhatId = :a.Id];
    System.assertEquals(0, taskCount, 'no task when createTask is false');
  }

  @IsTest
  static void deleteInstanceRemovesRow() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Draft'
    );
    insert inst;
    DocEngineInstanceController.FileSaveResult file = DocEngineInstanceController.saveHtml(
      inst.Id,
      EncodingUtil.base64Encode(Blob.valueOf('<html></html>')),
      'delete-me.html'
    );

    Test.startTest();
    DocEngineInstanceController.deleteInstance(inst.Id);
    Test.stopTest();

    System.assertEquals(0, [SELECT COUNT() FROM DocEngine_Document__c WHERE Id = :inst.Id]);
    System.assertEquals(
      0,
      [SELECT COUNT() FROM ContentDocument WHERE Id = :file.contentDocumentId],
      'authorized attached file should be deleted transactionally'
    );
  }

  @IsTest
  static void deleteInstanceDeniedWithoutDeletePermission() {
    // Setup-object DML (User / PermissionSetAssignment) must run inside System.runAs
    // to avoid MIXED_DML_OPERATION with custom objects in the same test context.
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
      Alias = 'deuser',
      Email = 'docengine.user@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'DocEngineUser',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = p.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      UserName = 'docengine.user.' + String.valueOf(Crypto.getRandomInteger()) + '@example.com'
    );
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert u;
      insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
    }

    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Draft'
    );
    insert inst;

    Boolean denied = false;
    System.runAs(u) {
      try {
        DocEngineInstanceController.deleteInstance(inst.Id);
      } catch (AuraHandledException e) {
        denied = true;
      } catch (System.NoAccessException e) {
        denied = true;
      } catch (DmlException e) {
        denied = true;
      }
    }

    System.assert(denied, 'Expected deleteInstance to fail for DocEngine_User (no Delete CRUD)');
    System.assertEquals(
      1,
      [SELECT COUNT() FROM DocEngine_Document__c WHERE Id = :inst.Id],
      'Document must remain after denied delete'
    );
  }

  @IsTest
  static void savePdfBase64() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Draft'
    );
    insert inst;

    String b64 = EncodingUtil.base64Encode(Blob.valueOf('%PDF-1.4'));
    DocEngineInstanceController.PdfSaveResult result = DocEngineInstanceController.savePdf(
      inst.Id,
      b64,
      '../x'
    );
    System.assertNotEquals(null, result.contentDocumentId);
    ContentVersion savedVersion = [
      SELECT PathOnClient
      FROM ContentVersion
      WHERE Id = :result.contentVersionId
    ];
    System.assertEquals(false, savedVersion.PathOnClient.contains('/'));
    System.assertEquals(false, savedVersion.PathOnClient.contains('\\'));
    System.assert(savedVersion.PathOnClient.endsWith('.pdf'));
  }

  @IsTest
  static void uploadFieldImageReturnsUrl() {
    Account a = new Account(Name = 'Acme');
    insert a;
    // 1x1 PNG
    String png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    Test.startTest();
    DocEngineInstanceController.ImageUploadResult result = DocEngineInstanceController.uploadFieldImage(
      a.Id,
      png,
      'logo.png'
    );
    Test.stopTest();

    System.assertNotEquals(null, result.contentVersionId);
    System.assertNotEquals(null, result.contentDocumentId);
    System.assert(String.isNotBlank(result.url), 'Expected image URL');
    System.assert(
      result.url.contains('/sfc/servlet.shepherd/version/download/'),
      'Expected an authenticated Salesforce download URL'
    );
    System.assertEquals(
      0,
      [SELECT COUNT() FROM ContentDistribution],
      'ordinary image upload must not create a public distribution'
    );
  }

  @IsTest
  static void listAndResolveRecordImages() {
    Account a = new Account(Name = 'Acme');
    insert a;
    String png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    DocEngineInstanceController.ImageUploadResult uploaded = DocEngineInstanceController.uploadFieldImage(
      a.Id,
      png,
      'logo.png'
    );

    Test.startTest();
    List<DocEngineInstanceController.RecordImageItem> items = DocEngineInstanceController.listRecordImages(
      a.Id
    );
    DocEngineInstanceController.ImageUploadResult resolved = DocEngineInstanceController.resolveFieldImage(
      String.valueOf(uploaded.contentVersionId),
      String.valueOf(a.Id)
    );
    Test.stopTest();

    System.assertEquals(1, items.size());
    System.assertEquals(uploaded.contentVersionId, items[0].contentVersionId);
    System.assertEquals('png', items[0].fileExtension);
    System.assertNotEquals(null, resolved.contentVersionId);
    System.assert(String.isNotBlank(resolved.url), 'Expected resolved image URL');
    System.assertEquals(
      0,
      [SELECT COUNT() FROM ContentDistribution],
      'resolving an existing image must not create a public distribution'
    );
  }

  @IsTest
  static void resolveFieldImageRejectsUnrelatedRecord() {
    Account linked = new Account(Name = 'Linked');
    Account unrelated = new Account(Name = 'Unrelated');
    insert new List<Account>{ linked, unrelated };
    String png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    DocEngineInstanceController.ImageUploadResult uploaded =
      DocEngineInstanceController.uploadFieldImage(linked.Id, png, 'logo.png');

    Boolean threw = false;
    try {
      DocEngineInstanceController.resolveFieldImage(
        String.valueOf(uploaded.contentVersionId),
        String.valueOf(unrelated.Id)
      );
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'an unrelated record must not authorize image resolution');
  }

  @IsTest
  static void sendShareEmailRejectsUnrelatedFile() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    Account other = new Account(Name = 'Other');
    insert new List<Account>{ a, other };
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Completed'
    );
    insert inst;
    ContentVersion unrelated = new ContentVersion(
      Title = 'unrelated',
      PathOnClient = 'unrelated.txt',
      VersionData = Blob.valueOf('not this document'),
      FirstPublishLocationId = other.Id
    );
    insert unrelated;

    Boolean threw = false;
    try {
      DocEngineInstanceController.sendShareEmail(
        unrelated.Id,
        'buyer@example.com',
        'Wrong file',
        'Must not send.',
        false,
        inst.Id
      );
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'an unrelated file must not be emailed');
  }

  @IsTest
  static void saveFileRejectsInvalidBase64() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;
    DocEngine_Document__c inst = new DocEngine_Document__c(
      Template__c = t.Id,
      Record_Id__c = a.Id,
      Object_API_Name__c = 'Account',
      Document_JSON__c = '{}',
      Status__c = 'Draft'
    );
    insert inst;

    Boolean threw = false;
    try {
      DocEngineInstanceController.savePdf(inst.Id, 'not-valid-base64!', '../unsafe.pdf');
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'invalid file data must be rejected');
  }

  @IsTest
  static void saveInstanceRejectsOversizedJson() {
    DocEngine_Template__c t = makeTemplate();
    Account a = new Account(Name = 'Acme');
    insert a;

    DocEngineInstanceController.InstanceDTO dto = new DocEngineInstanceController.InstanceDTO();
    dto.templateId = t.Id;
    dto.recordId = a.Id;
    dto.objectApiName = 'Account';
    dto.documentJson = '{"x":"' + 'a'.repeat(131070) + '"}';
    dto.status = 'Draft';

    Boolean threw = false;
    try {
      DocEngineInstanceController.saveInstance(dto);
    } catch (AuraHandledException e) {
      // AuraHandledException.getMessage() is often "Script-thrown exception" in tests.
      threw = true;
    }
    System.assert(threw, 'Expected oversized documentJson to fail');
  }

  @IsTest
  static void rejectsVersionSubstitutionAndDocumentRetargeting() {
    DocEngine_Template__c first = makeTemplate();
    DocEngine_Template__c second = makeTemplate();
    Id firstVersion = DocEngineTemplateVersionService.ensureCurrentVersionId(first.Id);
    Id secondVersion = DocEngineTemplateVersionService.ensureCurrentVersionId(second.Id);
    Account firstAccount = new Account(Name = 'First');
    Account secondAccount = new Account(Name = 'Second');
    insert new List<Account>{ firstAccount, secondAccount };

    DocEngineInstanceController.InstanceDTO dto = new DocEngineInstanceController.InstanceDTO();
    dto.templateId = first.Id;
    dto.templateVersionId = secondVersion;
    dto.recordId = firstAccount.Id;
    dto.objectApiName = 'Account';
    dto.documentJson = '{"kind":"field","sections":{}}';
    Boolean threw = false;
    try {
      DocEngineInstanceController.saveInstance(dto);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'A version from another template must be rejected');

    dto.templateVersionId = firstVersion;
    DocEngineInstanceController.InstanceDTO saved = DocEngineInstanceController.saveInstance(dto);
    saved.documentJson = '{"kind":"field","sections":{"x":{}}}';
    saved.recordId = secondAccount.Id;
    threw = false;
    try {
      DocEngineInstanceController.saveInstance(saved);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'An existing document source record is immutable');

    saved.recordId = firstAccount.Id;
    saved.templateVersionId = secondVersion;
    threw = false;
    try {
      DocEngineInstanceController.saveInstance(saved);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'An existing document version is immutable');

    dto.id = null;
    dto.templateVersionId = firstVersion;
    dto.recordId = firstAccount.Id;
    dto.objectApiName = 'Contact';
    threw = false;
    try {
      DocEngineInstanceController.saveInstance(dto);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Source Id/object mismatches must be rejected');
  }
}
