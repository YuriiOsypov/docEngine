@IsTest
private class DocEnginePublicFormTest {
  private static final String TEMPLATE_JSON =
    '{"kind":"template","version":1,"blocks":[],"fieldSchemas":{},' +
    '"fieldMapping":{"kind":"fieldMapping","version":1,"rules":[' +
    '{"section":"Applicant","field":"Company","sourcePath":"$payload.Company"},' +
    '{"section":"Applicant","field":"Last","sourcePath":"$payload.LastName"}' +
    ']}}';

  private static DocEngine_Template__c makePublicTemplate() {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Public Form T',
      Object_API_Name__c = 'Lead',
      Template_JSON__c = TEMPLATE_JSON,
      Is_Active__c = true,
      Version__c = 1,
      Public_Form_Enabled__c = true,
      Public_Form_Mode__c = 'Create',
      PDF_Filename__c = 'application.pdf',
      Output_Format__c = 'pdf'
    );
    insert t;
    DocEngineTemplateVersionService.ensureCurrentVersionId(t.Id);
    return [
      SELECT
        Id,
        Name,
        Object_API_Name__c,
        Current_Version__c,
        Public_Form_Enabled__c,
        Template_JSON__c
      FROM DocEngine_Template__c
      WHERE Id = :t.Id
    ];
  }

  private static String answersJson(String company, String lastName) {
    return JSON.serialize(
      new Map<String, Object>{
        'kind' => 'field',
        'version' => 2,
        'sections' => new Map<String, Object>{
          'Applicant' => new Map<String, Object>{
            'Company' => company,
            'Last' => lastName
          }
        }
      }
    );
  }

  @IsTest
  static void createGetSubmitAndRevoke() {
    DocEngine_Template__c tmpl = makePublicTemplate();

    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = tmpl.Id;
    req.name = 'Apply Now';
    req.mode = 'Create';
    req.maxSubmissions = 5;
    req.requireCaptcha = false;

    Test.startTest();
    DocEngineFormLinkController.FormLinkDTO link = DocEngineFormLinkController.createFormLink(req);
    System.assertNotEquals(null, link.token);
    System.assertEquals(true, link.isActive);

    String formJson = DocEnginePublicFormController.getPublicForm(link.token);
    Map<String, Object> form = (Map<String, Object>) JSON.deserializeUntyped(formJson);
    System.assertEquals(false, form.get('requireCaptcha'));
    System.assert(!String.valueOf(form.get('templateJson')).contains('fieldMapping'));

    String submitJson = DocEnginePublicFormController.submitPublicForm(
      link.token,
      answersJson('Acme', 'Smith'),
      null,
      null
    );
    Map<String, Object> submit = (Map<String, Object>) JSON.deserializeUntyped(submitJson);
    System.assertEquals(true, submit.get('ok'));
    System.assertNotEquals(null, submit.get('recordId'));
    System.assertNotEquals(null, submit.get('documentId'));

    List<DocEngineFormLinkController.FormLinkDTO> listed =
      DocEngineFormLinkController.listFormLinks(tmpl.Id);
    System.assertEquals(1, listed.size());
    System.assertEquals(1, listed[0].submissionCount);

    DocEngineFormLinkController.revokeFormLink(link.id);
    DocEngine_Form_Link__c revoked = [
      SELECT Is_Active__c FROM DocEngine_Form_Link__c WHERE Id = :link.id
    ];
    System.assertEquals(false, revoked.Is_Active__c);
    Test.stopTest();
  }

  @IsTest
  static void createRequiresPublicEnabled() {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'No Public',
      Object_API_Name__c = 'Lead',
      Template_JSON__c = TEMPLATE_JSON,
      Is_Active__c = true,
      Version__c = 1,
      Public_Form_Enabled__c = false
    );
    insert t;
    DocEngineTemplateVersionService.ensureCurrentVersionId(t.Id);

    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = t.Id;
    Boolean threw = false;
    try {
      DocEngineFormLinkController.createFormLink(req);
    } catch (AuraHandledException e) {
      threw = true;
      System.assert(e.getMessage().contains('Enable Public Form'));
    }
    System.assert(threw);
  }

  @IsTest
  static void captchaConfigurationAndLegacyLinksAreRejected() {
    DocEngine_Template__c tmpl = makePublicTemplate();
    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = tmpl.Id;
    req.requireCaptcha = true;
    Boolean threw = false;
    try {
      DocEngineFormLinkController.createFormLink(req);
    } catch (AuraHandledException e) {
      threw = true;
      System.assert(e.getMessage().contains('CAPTCHA'));
    }
    System.assert(threw);

    DocEngine_Form_Link__c legacy = new DocEngine_Form_Link__c(
      Name = 'Legacy Captcha',
      Token__c = DocEnginePublicFormService.newToken(),
      Template__c = tmpl.Id,
      Template_Version__c = tmpl.Current_Version__c,
      Object_API_Name__c = 'Lead',
      Mode__c = 'Create',
      Is_Active__c = true,
      Submission_Count__c = 0,
      Require_Captcha__c = true
    );
    insert legacy;

    threw = false;
    try {
      DocEnginePublicFormController.getPublicForm(legacy.Token__c);
    } catch (AuraHandledException e) {
      threw = true;
      System.assert(e.getMessage().contains('CAPTCHA'));
    }
    System.assert(threw);
  }

  @IsTest
  static void linkRejectsForeignVersionAndWrongUpdateObject() {
    DocEngine_Template__c first = makePublicTemplate();
    DocEngine_Template__c second = makePublicTemplate();
    Id foreignVersion = DocEngineTemplateVersionService.ensureCurrentVersionId(second.Id);

    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = first.Id;
    req.templateVersionId = foreignVersion;
    req.requireCaptcha = false;
    Boolean threw = false;
    try {
      DocEngineFormLinkController.createFormLink(req);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Foreign template version must be rejected');

    Account acct = new Account(Name = 'Wrong Object');
    insert acct;
    req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = first.Id;
    req.mode = 'Update';
    req.recordId = String.valueOf(acct.Id);
    threw = false;
    try {
      DocEngineFormLinkController.createFormLink(req);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Update record must match template object');
  }

  @IsTest
  static void sanitizeStripsMapping() {
    String raw =
      '{"kind":"template","fieldMapping":{"rules":[]},"fieldSchemas":{"a":1},"blocks":[]}';
    String cleaned = DocEnginePublicFormService.sanitizeTemplateJson(raw);
    System.assert(!cleaned.contains('fieldMapping'));
    System.assert(cleaned.contains('fieldSchemas'));
  }

  @IsTest
  static void submitCreateWithoutFieldMapping() {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Doc Only',
      Object_API_Name__c = 'Lead',
      Template_JSON__c = '{"kind":"template","version":1,"blocks":[],"fieldSchemas":{}}',
      Is_Active__c = true,
      Version__c = 1,
      Public_Form_Enabled__c = true,
      Public_Form_Mode__c = 'Create'
    );
    insert t;
    DocEngineTemplateVersionService.ensureCurrentVersionId(t.Id);

    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = t.Id;
    DocEngineFormLinkController.FormLinkDTO link = DocEngineFormLinkController.createFormLink(req);

    Test.startTest();
    String submitJson = DocEnginePublicFormController.submitPublicForm(
      link.token,
      '{"kind":"field","sections":{"X":{"Y":"Z"}}}',
      null,
      null
    );
    Test.stopTest();

    Map<String, Object> submit = (Map<String, Object>) JSON.deserializeUntyped(submitJson);
    System.assertEquals(true, submit.get('ok'));
    System.assertEquals(null, submit.get('recordId'));
    System.assertNotEquals(null, submit.get('documentId'));
  }

  @IsTest
  static void updateModeWritesExistingLead() {
    DocEngine_Template__c tmpl = makePublicTemplate();
    Lead lead = new Lead(LastName = 'Before', Company = 'Before Co');
    insert lead;

    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = tmpl.Id;
    req.mode = 'Update';
    req.recordId = String.valueOf(lead.Id);
    DocEngineFormLinkController.FormLinkDTO link = DocEngineFormLinkController.createFormLink(req);

    Test.startTest();
    String formJson = DocEnginePublicFormController.getPublicForm(link.token);
    Map<String, Object> form = (Map<String, Object>) JSON.deserializeUntyped(formJson);
    System.assertNotEquals(null, form.get('prefill'));

    String submitJson = DocEnginePublicFormController.submitPublicForm(
      link.token,
      answersJson('After Co', 'After'),
      null,
      null
    );
    Test.stopTest();

    Map<String, Object> submit = (Map<String, Object>) JSON.deserializeUntyped(submitJson);
    System.assertEquals(true, submit.get('ok'));
    System.assertEquals(String.valueOf(lead.Id), String.valueOf(submit.get('recordId')));
    Lead updated = [SELECT Company, LastName FROM Lead WHERE Id = :lead.Id];
    System.assertEquals('After Co', updated.Company);
    System.assertEquals('After', updated.LastName);
  }

  @IsTest
  static void submissionLimitIsRecheckedBeforeWrite() {
    DocEngine_Template__c tmpl = makePublicTemplate();
    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = tmpl.Id;
    req.maxSubmissions = 1;
    DocEngineFormLinkController.FormLinkDTO link = DocEngineFormLinkController.createFormLink(req);

    DocEnginePublicFormController.submitPublicForm(
      link.token,
      answersJson('One', 'First'),
      null,
      null
    );

    Boolean threw = false;
    try {
      DocEnginePublicFormController.submitPublicForm(
        link.token,
        answersJson('Two', 'Second'),
        null,
        null
      );
    } catch (AuraHandledException e) {
      threw = true;
      System.assert(e.getMessage().contains('submission limit'));
    }
    System.assert(threw);
  }

  @IsTest
  static void submitAttachesPdfElevated() {
    DocEngine_Template__c tmpl = makePublicTemplate();
    DocEngineFormLinkController.FormLinkDTO req = new DocEngineFormLinkController.FormLinkDTO();
    req.templateId = tmpl.Id;
    req.allowPdfAttach = true;
    DocEngineFormLinkController.FormLinkDTO link = DocEngineFormLinkController.createFormLink(req);

    Test.startTest();
    String submitJson = DocEnginePublicFormController.submitPublicForm(
      link.token,
      answersJson('PdfCo', 'PdfPerson'),
      '<html><body><h1>Hello</h1></body></html>',
      null
    );
    Test.stopTest();

    Map<String, Object> submit = (Map<String, Object>) JSON.deserializeUntyped(submitJson);
    System.assertEquals(true, submit.get('ok'));
    Id documentId = (Id) submit.get('documentId');
    DocEngine_Document__c doc = [
      SELECT Content_Document_Id__c FROM DocEngine_Document__c WHERE Id = :documentId
    ];
    System.assert(String.isNotBlank(doc.Content_Document_Id__c), 'PDF ContentDocument should be set');
  }

  @IsTest
  static void blankTokenIsRejected() {
    Boolean threw = false;
    try {
      DocEnginePublicFormController.getPublicForm('   ');
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw);

    threw = false;
    try {
      DocEnginePublicFormController.getPublicForm('no-such-token');
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw);
  }
}
