/**
 * Guest Experience Cloud entry points for Public Forms Mode.
 * Do not grant Guest access to Merge / List / full Template controllers.
 */
public with sharing class DocEnginePublicFormController {
  @AuraEnabled(cacheable=true)
  public static String getPublicForm(String token) {
    try {
      DocEnginePublicFormService.ResolvedLink resolved = DocEnginePublicFormService.resolveLink(
        token
      );
      return JSON.serialize(DocEnginePublicFormService.buildPublicFormDto(resolved));
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw DocEnginePublicFormService.auraError(e.getMessage());
    }
  }

  @AuraEnabled
  public static String submitPublicForm(
    String token,
    String answersJson,
    String html,
    String captchaToken
  ) {
    try {
      return JSON.serialize(
        DocEnginePublicFormService.submit(token, answersJson, html, captchaToken)
      );
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw DocEnginePublicFormService.auraError(e.getMessage());
    }
  }
}
