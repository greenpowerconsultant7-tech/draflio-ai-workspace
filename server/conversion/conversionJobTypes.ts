export type ConversionOperation =
  | "word-to-pdf"
  | "pdf-to-word"
  | "excel-to-pdf"
  | "pdf-to-excel"
  | "powerpoint-to-pdf"
  | "pdf-to-powerpoint";

export type ConversionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ConversionJobStage =
  | "queued"
  | "validating"
  | "authenticating"
  | "creating-asset"
  | "uploading"
  | "submitting"
  | "processing"
  | "downloading"
  | "preparing"
  | "completed"
  | "failed"
  | "cancelled";

export type ConversionProgress =
  | {
      mode: "determinate";
      value: number;
    }
  | {
      mode: "indeterminate";
    };

export type ConversionJobError = {
  message: string;
  code?: string;
};

export type ConversionJobPublicData = {
  id: string;
  operation: ConversionOperation;
  status: ConversionJobStatus;
  stage: ConversionJobStage;
  message: string;
  progress: ConversionProgress;
  originalFilename: string;
  outputFilename: string;
  inputMediaType: string;
  outputMediaType: string;
  createdAt: string;
  updatedAt: string;
  resultReady: boolean;
  error?: ConversionJobError;
};

export type ConversionJobRecord = {
  id: string;
  operation: ConversionOperation;
  status: ConversionJobStatus;
  stage: ConversionJobStage;
  message: string;
  progress: ConversionProgress;
  originalFilename: string;
  outputFilename: string;
  inputMediaType: string;
  outputMediaType: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  inputBuffer: Buffer;
  outputBuffer?: Buffer;
  error?: ConversionJobError;
  abortController: AbortController;
};

export type CreateConversionJobInput = {
  operation: ConversionOperation;
  originalFilename: string;
  outputFilename: string;
  inputMediaType: string;
  outputMediaType: string;
  inputBuffer: Buffer;
};

export type UpdateConversionJobInput = {
  status?: ConversionJobStatus;
  stage?: ConversionJobStage;
  message?: string;
  progress?: ConversionProgress;
  outputBuffer?: Buffer;
  error?: ConversionJobError;
};
