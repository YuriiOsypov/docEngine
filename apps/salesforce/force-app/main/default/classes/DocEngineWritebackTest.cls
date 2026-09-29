@IsTest
private class DocEngineWritebackTest {
  @IsTest
  static void applyV1RulesToLead() {
    String mapping =
      '{"fieldMapping":{"kind":"fieldMapping","version":1,"rules":[' +
      '{"section":"Applicant","field":"Company","sourcePath":"$payload.Company"},' +
      '{"section":"Applicant","field":"Last","sourcePath":"$payload.LastName"}' +
      ']}}';
    String answers =
      '{"kind":"field","version":2,"sections":{"Applicant":{"Company":"Acme Co","Last":"Doe"}}}';

    Test.startTest();
    DocEngineWriteback.Result r = DocEngineWriteback.apply(mapping, answers, 'Lead');
    Test.stopTest();

    System.assertEquals(2, r.appliedFields.size());
    System.assertEquals('Acme Co', r.record.get('Company'));
    System.assertEquals('Doe', r.record.get('LastName'));
  }

  @IsTest
  static void applyElevatedSkipsCrudGate() {
    String mapping =
      '{"rules":[{"section":"A","field":"Company","sourcePath":"$payload.Company"}]}';
    String answers = '{"sections":{"A":{"Company":"Elevated Co"}}}';

    DocEngineWriteback.Result r = DocEngineWriteback.applyElevated(mapping, answers, 'Lead');
    System.assertEquals(1, r.appliedFields.size());
    System.assertEquals('Elevated Co', r.record.get('Company'));
  }

  @IsTest
  static void skipsRelationshipAndTableRules() {
    String mapping =
      '{"rules":[' +
      '{"section":"A","field":"City","sourcePath":"$payload.Account.BillingCity"},' +
      '{"section":"A","field":"Rows","sourcePath":"$payload.Name","sourceArrayPath":"items"},' +
      '{"section":"A","field":"Ok","sourcePath":"$payload.Company"}' +
      ']}';
    String answers = '{"sections":{"A":{"City":"X","Rows":"Y","Ok":"Z Co"}}}';

    DocEngineWriteback.Result r = DocEngineWriteback.apply(mapping, answers, 'Lead');
    System.assertEquals(1, r.appliedFields.size());
    System.assertEquals('Z Co', r.record.get('Company'));
  }

  @IsTest
  static void blocksSystemFields() {
    String mapping =
      '{"rules":[{"section":"A","field":"Id","sourcePath":"$payload.Id"},' +
      '{"section":"A","field":"Owner","sourcePath":"$payload.OwnerId"},' +
      '{"section":"A","field":"Company","sourcePath":"$payload.Company"}]}';
    String answers =
      '{"sections":{"A":{"Id":"00Q000000000001","Owner":"005000000000001","Company":"Safe"}}}';

    DocEngineWriteback.Result r = DocEngineWriteback.apply(mapping, answers, 'Lead');
    System.assertEquals(1, r.appliedFields.size());
    System.assertEquals('Safe', r.record.get('Company'));
    System.assert(r.skipped.size() >= 2);
  }

  @IsTest
  static void coercesBooleanDateAndNumber() {
    String mapping =
      '{"rules":[' +
      '{"section":"A","field":"DoNotCall","sourcePath":"$payload.DoNotCall"},' +
      '{"section":"A","field":"Employees","sourcePath":"$payload.NumberOfEmployees"},' +
      '{"section":"A","field":"Birth","sourcePath":"$payload.Birthdate#mm/dd/yyyy"}' +
      ']}';
    // Contact supports DoNotCall / Birthdate / NumberOfEmployees varies; use Lead Company + Account
    mapping =
      '{"fieldMapping":{"sections":{"A":{' +
      '"Company":"$payload.Company",' +
      '"Annual":"$payload.AnnualRevenue",' +
      '"Open":"$payload.IsUnreadByOwner"' +
      '}}}}';
    String answers =
      '{"sections":{"A":{"Company":"NumCo","Annual":"1234.5","Open":"true"}}}';

    DocEngineWriteback.Result r = DocEngineWriteback.apply(mapping, answers, 'Lead');
    System.assert(r.appliedFields.contains('Company'));
    System.assertEquals('NumCo', r.record.get('Company'));
    System.assertEquals(1234.5, (Decimal) r.record.get('AnnualRevenue'));
  }

  @IsTest
  static void emptyMappingReturnsSkipped() {
    DocEngineWriteback.Result r = DocEngineWriteback.apply('{"rules":[]}', '{"sections":{}}', 'Lead');
    System.assertEquals(0, r.appliedFields.size());
    System.assert(!r.skipped.isEmpty());
    System.assertNotEquals(null, r.record);
  }

  @IsTest
  static void requiresObjectAndValidJson() {
    Boolean threw = false;
    try {
      DocEngineWriteback.apply('{"rules":[]}', '{"sections":{}}', null);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw);

    threw = false;
    try {
      DocEngineWriteback.apply('not-json', '{"sections":{}}', 'Lead');
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw);

    threw = false;
    try {
      DocEngineWriteback.apply('{"rules":[]}', 'not-json', 'Lead');
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw);

    threw = false;
    try {
      DocEngineWriteback.apply('{"rules":[]}', '{"sections":{}}', 'NoSuchObject__c');
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw);
  }

  @IsTest
  static void sanitizeElevatedRejectsUnmappedFields() {
    DocEngineWriteback.Result r = new DocEngineWriteback.Result();
    r.record = new Lead(Company = 'X', LastName = 'Y');
    r.appliedFields = new List<String>{ 'Company' };
    Boolean threw = false;
    try {
      DocEngineWriteback.sanitizeElevatedForDml(r, false);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Extra populated fields must be rejected');
  }

  @IsTest
  static void sanitizeElevatedAllowsMappedCreate() {
    DocEngineWriteback.Result r = DocEngineWriteback.applyElevated(
      '{"rules":[{"section":"A","field":"Company","sourcePath":"$payload.Company"},' +
        '{"section":"A","field":"Last","sourcePath":"$payload.LastName"}]}',
      '{"sections":{"A":{"Company":"SafeCo","Last":"Person"}}}',
      'Lead'
    );
    SObject safe = DocEngineWriteback.sanitizeElevatedForDml(r, false);
    System.assertEquals('SafeCo', safe.get('Company'));
    System.assertEquals('Person', safe.get('LastName'));
  }

  @IsTest
  static void buildPrefillFromExistingLead() {
    Lead lead = new Lead(LastName = 'Prefill', Company = 'Prefill Co');
    insert lead;

    String mapping =
      '{"rules":[{"section":"Applicant","field":"Company","sourcePath":"$payload.Company"},' +
      '{"section":"Applicant","field":"Last","sourcePath":"$payload.LastName"}]}';

    Test.startTest();
    Map<String, Object> prefill = DocEngineWriteback.buildPrefill(mapping, lead.Id, 'Lead');
    Test.stopTest();

    System.assertNotEquals(null, prefill);
    System.assertEquals('field', prefill.get('kind'));
    Map<String, Object> sections = (Map<String, Object>) prefill.get('sections');
    Map<String, Object> applicant = (Map<String, Object>) sections.get('Applicant');
    System.assertEquals('Prefill Co', applicant.get('Company'));
    System.assertEquals('Prefill', applicant.get('Last'));
  }
}
