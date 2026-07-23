export type DocumentIntelligenceStatus =
  | "preparing"
  | "queued"
  | "extracting"
  | "ready"
  | "failed"
  | "cancelled";

export type DocumentIntelligenceStage =
  | "uploaded"
  | "queued"
  | "opening"
  | "inspecting-pages"
  | "extracting-text"
  | "classifying"
  | "chunking"
  | "ready"
  | "failed"
  | "cancelled";

export type DocumentClassification =
  | "native-vector-searchable"
  | "searchable-low-vector"
  | "mixed-content"
  | "image-only"
  | "empty-or-unsupported";

export type DocumentIntelligenceProgress =
  | { mode: "indeterminate" }
  | { mode: "determinate"; unit: "pages"; completed: number; total: number };

export type DocumentPageDimension = {
  pageIndex: number;
  width: number;
  height: number;
  rotation: number;
};

export type PublicDocumentIntelligenceSession = {
  id: string;
  status: DocumentIntelligenceStatus;
  stage: DocumentIntelligenceStage;
  message: string;
  progress: DocumentIntelligenceProgress;
  revision: number;
  originalFilename: string;
  pageCount?: number;
  pageDimensions?: DocumentPageDimension[];
  documentClassification?: DocumentClassification;
  searchableTextAvailable: boolean;
  ocrRequired: boolean;
  createdAt: string;
  updatedAt: string;
  ready: boolean;
  error?: { code: string; message: string };
};
