import type {
  DocumentClassification,
  DocumentIntelligenceProgress,
  DocumentIntelligenceStage,
  DocumentIntelligenceStatus,
  DocumentPageDimension,
} from "../../shared/documentIntelligenceTypes.js";

export type NormalizedTextItem = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  hasLineBreak: boolean;
  direction?: string;
  sourceIndex: number;
};

export type DocumentPageContext = {
  pageIndex: number;
  text: string;
  items: NormalizedTextItem[];
  evidence: { textItems: number; vectorOperations: number; imageOperations: number };
};

export type DocumentTextChunk = {
  id: string;
  pageIndex: number;
  text: string;
  sequence: number;
  startItemIndex: number;
  endItemIndex: number;
  characterCount: number;
};

export type DocumentIntelligenceContext = {
  classification: DocumentClassification;
  pageDimensions: DocumentPageDimension[];
  pages: DocumentPageContext[];
  chunks: DocumentTextChunk[];
};

export type DocumentIntelligenceSessionRecord = {
  id: string;
  status: DocumentIntelligenceStatus;
  stage: DocumentIntelligenceStage;
  message: string;
  progress: DocumentIntelligenceProgress;
  revision: number;
  originalFilename: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  inputBytes?: Uint8Array;
  context?: DocumentIntelligenceContext;
  error?: { code: string; message: string };
  abortController: AbortController;
};
