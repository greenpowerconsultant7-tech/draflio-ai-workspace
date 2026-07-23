import { Router, type RequestHandler } from "express";
import multer from "multer";
import { ApiError } from "../errors/apiError.js";
import { asyncHandler } from "../errors/asyncHandler.js";
import { DOCUMENT_INTELLIGENCE_LIMITS } from "./documentIntelligenceSessionStore.js";
import {
  cancelPublicDocumentIntelligenceSession,
  createDocumentIntelligence,
  getPublicDocumentIntelligenceSession,
} from "./documentIntelligenceService.js";
import { validateDocumentIntelligenceUpload } from "./documentIntelligenceValidator.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DOCUMENT_INTELLIGENCE_LIMITS.maximumInputBytes,
    files: 1,
  },
});

const documentIntelligenceUpload: RequestHandler = (request, response, next) => {
  upload.single("file")(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(
        new ApiError({
          statusCode: 413,
          code: "DOCUMENT_INTELLIGENCE_FILE_TOO_LARGE",
          message: "The PDF exceeds the 20 MB size limit.",
        }),
      );
      return;
    }
    next(error);
  });
};

function parameter(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export function createDocumentIntelligenceRouter(creationLimiter: RequestHandler) {
  const router = Router();
  router.post(
    "/",
    creationLimiter,
    documentIntelligenceUpload,
    asyncHandler(async (request, response) => {
      let controlledBytes: Uint8Array | undefined;
      try {
        const validated = validateDocumentIntelligenceUpload(request.file);
        controlledBytes = validated.bytes;
        const session = createDocumentIntelligence(validated.filename, controlledBytes);
        response
          .status(202)
          .location(`/api/document-intelligence/sessions/${session.id}`)
          .json({ session });
      } finally {
        controlledBytes?.fill(0);
        request.file?.buffer.fill(0);
      }
    }),
  );
  router.get(
    "/:sessionId",
    asyncHandler(async (request, response) => {
      response.status(200).json({
        session: getPublicDocumentIntelligenceSession(
          parameter(request.params.sessionId),
        ),
      });
    }),
  );
  router.delete(
    "/:sessionId",
    asyncHandler(async (request, response) => {
      response.status(200).json({
        session: cancelPublicDocumentIntelligenceSession(
          parameter(request.params.sessionId),
        ),
      });
    }),
  );
  return router;
}
