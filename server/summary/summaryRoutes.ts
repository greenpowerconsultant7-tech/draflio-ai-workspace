import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../errors/asyncHandler.js";
import {
  cancelPublicSummary,
  createSummary,
  getPublicSummary,
  getPublicSummaryResult,
} from "./summaryService.js";
import { parseSummaryOptions } from "./summaryValidation.js";

function parameter(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export function createSummaryRouter(creationLimiter: RequestHandler) {
  const router = Router();
  router.post(
    "/sessions/:sessionId/summaries",
    creationLimiter,
    asyncHandler(async (request, response) => {
      const job = createSummary(
        parameter(request.params.sessionId),
        parseSummaryOptions(request.body),
      );
      response
        .status(202)
        .location(`/api/document-intelligence/summaries/${job.id}`)
        .json({ summary: job });
    }),
  );
  router.get(
    "/summaries/:summaryId",
    asyncHandler(async (request, response) => {
      response.status(200).json({
        summary: getPublicSummary(parameter(request.params.summaryId)),
      });
    }),
  );
  router.get(
    "/summaries/:summaryId/result",
    asyncHandler(async (request, response) => {
      response
        .status(200)
        .set("Cache-Control", "no-store")
        .type("application/json")
        .json(getPublicSummaryResult(parameter(request.params.summaryId)));
    }),
  );
  router.delete(
    "/summaries/:summaryId",
    asyncHandler(async (request, response) => {
      response.status(200).json({
        summary: cancelPublicSummary(parameter(request.params.summaryId)),
      });
    }),
  );
  return router;
}
