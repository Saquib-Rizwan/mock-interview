import type { QuestionCategory, RoundType } from "../api";

// Enum values are snake_case in the database; these are their display forms.
export const ROUND_TYPE_LABELS: Record<RoundType, string> = {
  aptitude: "Aptitude",
  technical: "Technical",
  hr: "HR",
  coding: "Coding",
  group_discussion: "Group Discussion",
  managerial: "Managerial",
  other: "Other",
};

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  company_specific: "Company specific",
  os: "OS",
  cn: "Networks",
  dbms: "DBMS",
  dsa: "DSA",
  oops: "OOPS",
  general_hr: "General HR",
  aptitude: "Aptitude",
  other: "Other",
};
