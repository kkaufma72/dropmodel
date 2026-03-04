export type UseCase = "customer_support" | "knowledge_base" | "product_docs" | "sales" | "other"
export type Tone = "professional" | "friendly" | "casual"
export type FailureBehavior = "admit_unknown" | "suggest_contact" | "general_knowledge" | "collect_info"
export type CollectField = "name" | "email" | "phone" | "company"
export type ResponseLength = "concise" | "balanced" | "detailed"

export interface QuestionnaireAnswers {
  useCase: UseCase
  useCaseCustom?: string
  companyName?: string
  industry?: string
  tone: Tone
  failureBehavior: FailureBehavior
  contactInfo?: string
  collectFields: CollectField[]
  restrictions?: string
  customRules?: string
  language: string
  responseLength: ResponseLength
}
