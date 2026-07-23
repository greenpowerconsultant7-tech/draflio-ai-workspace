import type {
  PublicSummaryJob,
  SummaryOptions,
  SummaryResult,
  SummaryStage,
  SummaryStatus,
} from "../../shared/summaryTypes.js";
import type { DocumentIntelligenceProgress } from "../../shared/documentIntelligenceTypes.js";

export type SummaryCandidate = {
  id: string;
  pageNumber: number;
  sourceIndex: number;
  text: string;
  tokens: string[];
  headingLike: boolean;
  bulletLike: boolean;
  score: number;
};

export type SummaryJobRecord = {
  id: string;
  documentSessionId: string;
  status: SummaryStatus;
  stage: SummaryStage;
  message: string;
  progress: DocumentIntelligenceProgress;
  options: SummaryOptions;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  abortController: AbortController;
  result?: SummaryResult;
  error?: { code: string; message: string };
};

export type SummaryProgressUpdate = {
  stage: SummaryStage;
  message: string;
  progress: DocumentIntelligenceProgress;
};

export type SummaryPublicSerializer = (job: SummaryJobRecord) => PublicSummaryJob;
