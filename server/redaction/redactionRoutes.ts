import { Router, type RequestHandler } from "express";
import multer from "multer";
import { asyncHandler } from "../errors/asyncHandler.js";
import { sendAttachmentResponse } from "../http/attachmentResponse.js";
import { REDACTION_MAX_INPUT_BYTES } from "./redactionTypes.js";
import {
  redactionSessionService,
  type RedactionSessionService,
} from "./redactionSessionService.js";

const redactionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REDACTION_MAX_INPUT_BYTES, files: 1 },
});

function sessionIdParameter(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export function createRedactionRouter(
  creationRateLimiter: RequestHandler,
  service: RedactionSessionService = redactionSessionService,
): Router {
  const router = Router();

  router.post(
    "/",
    creationRateLimiter,
    redactionUpload.single("file"),
    asyncHandler(async (request, response) => {
      try {
        const session = await service.createSession(request.file);
        response.status(201).location(`/api/redaction-sessions/${session.id}`).json({ session });
      } finally {
        request.file?.buffer.fill(0);
      }
    }),
  );

  router.get(
    "/:sessionId",
    asyncHandler(async (request, response) => {
      response.status(200).json({
        session: service.getSession(sessionIdParameter(request.params.sessionId)),
      });
    }),
  );

  router.post(
    "/:sessionId/finalize",
    asyncHandler(async (request, response) => {
      const session = service.finalizeSession(
        sessionIdParameter(request.params.sessionId),
        request.body,
      );
      response.status(202).json({ session });
    }),
  );

  router.get(
    "/:sessionId/result",
    asyncHandler(async (request, response) => {
      const result = service.getResult(sessionIdParameter(request.params.sessionId));
      sendAttachmentResponse(response, result.data, {
        filename: result.filename,
        mediaType: "application/pdf",
        extension: ".pdf",
        cacheControl: "no-store",
      });
    }),
  );

  router.delete(
    "/:sessionId",
    asyncHandler(async (request, response) => {
      const session = await service.cancelSession(sessionIdParameter(request.params.sessionId));
      response.status(200).json({ session });
    }),
  );

  return router;
}
