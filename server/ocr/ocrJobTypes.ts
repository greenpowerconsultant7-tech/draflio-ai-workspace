import type {
  OcrLanguageCode,
  OcrLanguageInfo,
} from "../../shared/ocrLanguages";

export type OcrJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type OcrJobStage =
  | "queued"
  | "validating"
  | "processing"
  | "preparing"
  | "completed"
  | "failed"
  | "cancelled";

export type OcrProgress =
  | {
      mode: "determinate";
      value: number;
    }
  | {
      mode: "indeterminate";
    };

export type OcrJobError = {
  message: string;
  code?: string;
};

export type OcrJobPublicData = {
  id: string;

  status: OcrJobStatus;

  stage: OcrJobStage;

  message: string;

  progress: OcrProgress;

  originalFilename: string;

  outputFilename: string;

  ocrLanguage: OcrLanguageInfo;

  createdAt: string;

  updatedAt: string;

  resultReady: boolean;

  error?: OcrJobError;
};

export type OcrJobRecord = {
  id: string;

  status: OcrJobStatus;

  stage: OcrJobStage;

  message: string;

  progress: OcrProgress;

  originalFilename: string;

  outputFilename: string;

  ocrLanguage: OcrLanguageInfo;

  createdAt: Date;

  updatedAt: Date;

  expiresAt: Date;

  inputBuffer: Buffer;

  outputBuffer?: Buffer;

  error?: OcrJobError;

  abortController: AbortController;
};

export type CreateOcrJobInput = {
  originalFilename: string;

  outputFilename: string;

  ocrLanguage: OcrLanguageCode;

  inputBuffer: Buffer;
};

export type UpdateOcrJobInput = {
  status?: OcrJobStatus;

  stage?: OcrJobStage;

  message?: string;

  progress?: OcrProgress;

  outputBuffer?: Buffer;

  error?: OcrJobError;
};
