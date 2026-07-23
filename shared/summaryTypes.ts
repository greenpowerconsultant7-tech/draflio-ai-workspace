import type {
  DocumentClassification,
  DocumentIntelligenceProgress,
} from "./documentIntelligenceTypes.js";

export type SummaryMode = "brief" | "detailed" | "page-by-page";

export type SummaryOptions = {
  mode: SummaryMode;
  includeKeyPoints: boolean;
  includePossibleActionItems: boolean;
  includePageSummaries: boolean;
};

export const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  mode: "brief",
  includeKeyPoints: true,
  includePossibleActionItems: true,
  includePageSummaries: false,
};

export type SummaryReferenceItem = {
  id: string;
  text: string;
  pageReferences: number[];
};

export type SummaryResult = {
  schemaVersion: "1.0";
  generationMethod: "deterministic-extractive";
  mode: SummaryMode;
  documentClassification: DocumentClassification;
  overview: string;
  keyPoints: SummaryReferenceItem[];
  possibleActionItems: SummaryReferenceItem[];
  pageSummaries: Array<{ pageNumber: number; summary: string }>;
  limitations: string[];
  generatedAt: string;
};

export type SummaryStatus =
  | "queued"
  | "summarizing"
  | "ready"
  | "failed"
  | "cancelled";

export type SummaryStage =
  | "queued"
  | "preparing-context"
  | "selecting-sentences"
  | "building-key-points"
  | "finding-possible-actions"
  | "building-page-summaries"
  | "finalizing"
  | "ready"
  | "failed"
  | "cancelled";

export type PublicSummaryJob = {
  id: string;
  documentSessionId: string;
  status: SummaryStatus;
  stage: SummaryStage;
  message: string;
  progress: DocumentIntelligenceProgress;
  mode: SummaryMode;
  createdAt: string;
  updatedAt: string;
  ready: boolean;
  resultReady: boolean;
  error?: { code: string; message: string };
};
