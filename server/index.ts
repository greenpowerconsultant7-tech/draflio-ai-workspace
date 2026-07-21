import helmet from "helmet";

import {
  rateLimit,
} from "express-rate-limit";

import {
  setDefaultResultOrder,
} from "node:dns";

import {
  requestTimingMiddleware,
} from "./monitoring/requestTiming";

import cors from "cors";
import express from "express";
import multer from "multer";

import {
  convertDocxToPdf,
  convertPdfToDocx,
  convertPdfToPptx,
  convertPdfToXlsx,
  convertPdfWithOcr,
  convertPptxToPdf,
  convertXlsxToPdf,
} from "./adobePdfService";

import {
  generateInvoicePdf,
} from "./invoice/invoicePdfService";

import {
  validateInvoiceData,
} from "./invoice/invoiceValidator";

import {
  closeHtmlPdfBrowser,
  generateHtmlPdf,
} from "./html/htmlPdfService";

import {
  validateHtmlPdfRequest,
} from "./html/htmlPdfValidator";

import {
  generateWatermarkedPdf,
} from "./watermark/watermarkPdfService";

import {
  validateWatermarkRequest,
} from "./watermark/watermarkValidator";

import {
  requireApiKey,
} from "./auth/apiKeyMiddleware";

import {
  apiErrorHandler,
  requestIdMiddleware,
  unknownApiRoute,
} from "./errors/apiErrorMiddleware";

import {
  asyncHandler,
} from "./errors/asyncHandler";

import {
  badRequest,
  conflict,
  notFound,
  unprocessableContent,
} from "./errors/apiError";

import {
  validatePdfFile,
} from "./validation/fileValidation";

import {
  sendPdfResponse,
} from "./http/pdfResponse";

import {
  cancelOcrJob,
  createOcrJob,
  getOcrJobPublicData,
  getOcrJobResult,
} from "./ocr/ocrJobStore";

import {
  startOcrJob,
} from "./ocr/ocrJobService";

import {
  closeConversionJobStore,
} from "./conversion/conversionJobStore";

import {
  env,
} from "./env";

setDefaultResultOrder(
  "ipv4first"
);

const app = express();
app.use(requestIdMiddleware);
app.use(requestTimingMiddleware);

const port =
  env.port;

const isProduction =
  env.isProduction;

const allowedOrigins =
  env.frontendOrigins;

if (env.trustProxy) {
  app.set(
    "trust proxy",
    1
  );
}

const upload = multer({
  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      100 * 1024 * 1024,
  },
});

type ErrorWithCause = Error & {
  cause?: unknown;
};

function logServerError(
  message: string,
  error: unknown
) {
  console.error(
    message,
    error
  );

  if (
    error instanceof Error
  ) {
    const errorWithCause =
      error as ErrorWithCause;

    if (
      errorWithCause.cause
    ) {
      console.error(
        "Underlying cause:",
        errorWithCause.cause
      );
    }
  }
}

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  return error instanceof Error
    ? error.message
    : fallback;
}

app.disable(
  "x-powered-by"
);

app.use(
  helmet({
    /*
      This server returns API responses
      and downloadable files rather than
      HTML pages.
    */
    contentSecurityPolicy:
      false,

    /*
      Allow the frontend to receive PDF
      and Office files from this API.
    */
    crossOriginResourcePolicy: {
      policy:
        "cross-origin",
    },

    /*
      Do not force HTTPS while developing
      on localhost.
    */
    strictTransportSecurity:
      isProduction
        ? {
            maxAge:
              31_536_000,

            includeSubDomains:
              true,
          }
        : false,
  })
);

app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      /*
        Allow requests without an Origin,
        such as curl and health checks.
      */
      if (!origin) {
        callback(
          null,
          true
        );

        return;
      }

      /*
        During local development, allow
        localhost and 127.0.0.1 on any port.
      */
      if (!isProduction) {
        try {
          const parsedOrigin =
            new URL(origin);

          const isLocalHost =
            parsedOrigin.hostname ===
              "localhost" ||
            parsedOrigin.hostname ===
              "127.0.0.1";

          if (isLocalHost) {
            callback(
              null,
              true
            );

            return;
          }
        } catch {
          callback(
            new Error(
              "Invalid request origin."
            )
          );

          return;
        }
      }

      /*
        In production, only allow origins
        listed in FRONTEND_ORIGINS.
      */
      if (
        allowedOrigins.includes(
          origin
        )
      ) {
        callback(
          null,
          true
        );

        return;
      }

      console.warn(
        `[CORS] Blocked origin: ${origin}`
      );

      callback(
        new Error(
          `Origin ${origin} is not allowed by CORS.`
        )
      );
    },

    methods: [
    "GET",
    "POST",
    "DELETE",
    "OPTIONS",
],

    allowedHeaders: [
      "Content-Type",
    ],

    exposedHeaders: [
      "Content-Disposition",
      "Content-Length",
    ],

    maxAge:
      86_400,
  })
);

app.use(
  express.json({
    limit:
      "1mb",
  })
);

/*
  HEALTH CHECK
*/

app.get(
  "/api/health",
  (
    _request,
    response
  ) => {
    response.json({
      status:
        "ok",

      service:
        "Draflio Adobe PDF Server",
    });
  }
);

/*
  RATE LIMITING
*/

const conversionRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

   limit:
  isProduction
    ? 30
    : 1000,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    message: {
      error:
        "Too many conversion requests. Please wait a few minutes and try again.",
    },
  });

app.use(
  [
    "/api/word-to-pdf",
    "/api/pdf-to-word",
    "/api/excel-to-pdf",
    "/api/pdf-to-excel",
    "/api/powerpoint-to-pdf",
    "/api/pdf-to-powerpoint",
    "/api/ocr-pdf",
    "/api/ocr-jobs",
    "/api/invoice-to-pdf",
    "/api/html-to-pdf",
    "/api/pdf/watermark",
  ],
  conversionRateLimiter
);

/*
  WORD → PDF
*/

app.post(
  "/api/word-to-pdf",
  upload.single("file"),
  async (
    request,
    response
  ) => {
    try {
      const file =
        request.file;

      if (!file) {
        response
          .status(400)
          .json({
            error:
              "No DOCX file was uploaded.",
          });

        return;
      }

      if (
        !file.originalname
          .toLowerCase()
          .endsWith(
            ".docx"
          )
      ) {
        response
          .status(400)
          .json({
            error:
              "Please upload a DOCX file.",
          });

        return;
      }

      console.log(
        `[Server] Word → PDF: ${file.originalname}`
      );

      const convertedPdf =
        await convertDocxToPdf(
          file.buffer
        );

      const outputName =
        file.originalname.replace(
          /\.docx$/i,
          ".pdf"
        );

      response.setHeader(
        "Content-Type",
        "application/pdf"
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );

      response.setHeader(
        "Content-Length",
        convertedPdf.byteLength.toString()
      );

      response.send(
        convertedPdf
      );
    } catch (error) {
      logServerError(
        "Word to PDF conversion failed:",
        error
      );

      response
        .status(500)
        .json({
          error:
            getErrorMessage(
              error,
              "Word to PDF conversion failed."
            ),
        });
    }
  }
);

/*
  PDF → WORD
*/

app.post(
  "/api/pdf-to-word",
  upload.single("file"),
  async (
    request,
    response
  ) => {
    try {
      const file =
        request.file;

      if (!file) {
        response
          .status(400)
          .json({
            error:
              "No PDF file was uploaded.",
          });

        return;
      }

      if (
        !file.originalname
          .toLowerCase()
          .endsWith(
            ".pdf"
          )
      ) {
        response
          .status(400)
          .json({
            error:
              "Please upload a PDF file.",
          });

        return;
      }

      console.log(
        `[Server] PDF → Word: ${file.originalname}`
      );

      const convertedWord =
        await convertPdfToDocx(
          file.buffer
        );

      const outputName =
        file.originalname.replace(
          /\.pdf$/i,
          ".docx"
        );

      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );

      response.setHeader(
        "Content-Length",
        convertedWord.byteLength.toString()
      );

      response.send(
        convertedWord
      );
    } catch (error) {
      logServerError(
        "PDF to Word conversion failed:",
        error
      );

      response
        .status(500)
        .json({
          error:
            getErrorMessage(
              error,
              "PDF to Word conversion failed."
            ),
        });
    }
  }
);

/*
  EXCEL → PDF
*/

app.post(
  "/api/excel-to-pdf",
  upload.single("file"),
  async (
    request,
    response
  ) => {
    try {
      const file =
        request.file;

      if (!file) {
        response
          .status(400)
          .json({
            error:
              "No Excel file was uploaded.",
          });

        return;
      }

      if (
        !file.originalname
          .toLowerCase()
          .endsWith(
            ".xlsx"
          )
      ) {
        response
          .status(400)
          .json({
            error:
              "Please upload an XLSX file.",
          });

        return;
      }

      console.log(
        `[Server] Excel → PDF: ${file.originalname}`
      );

      const convertedPdf =
        await convertXlsxToPdf(
          file.buffer
        );

      const outputName =
        file.originalname.replace(
          /\.xlsx$/i,
          ".pdf"
        );

      response.setHeader(
        "Content-Type",
        "application/pdf"
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );

      response.setHeader(
        "Content-Length",
        convertedPdf.byteLength.toString()
      );

      response.send(
        convertedPdf
      );
    } catch (error) {
      logServerError(
        "Excel to PDF conversion failed:",
        error
      );

      response
        .status(500)
        .json({
          error:
            getErrorMessage(
              error,
              "Excel to PDF conversion failed."
            ),
        });
    }
  }
);

/*
  PDF → EXCEL
*/

app.post(
  "/api/pdf-to-excel",
  upload.single("file"),
  async (
    request,
    response
  ) => {
    try {
      const file =
        request.file;

      if (!file) {
        response
          .status(400)
          .json({
            error:
              "No PDF file was uploaded.",
          });

        return;
      }

      if (
        !file.originalname
          .toLowerCase()
          .endsWith(
            ".pdf"
          )
      ) {
        response
          .status(400)
          .json({
            error:
              "Please upload a PDF file.",
          });

        return;
      }

      console.log(
        `[Server] PDF → Excel: ${file.originalname}`
      );

      const convertedExcel =
        await convertPdfToXlsx(
          file.buffer
        );

      const outputName =
        file.originalname.replace(
          /\.pdf$/i,
          ".xlsx"
        );

      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );

      response.setHeader(
        "Content-Length",
        convertedExcel.byteLength.toString()
      );

      response.send(
        convertedExcel
      );
    } catch (error) {
      logServerError(
        "PDF to Excel conversion failed:",
        error
      );

      response
        .status(500)
        .json({
          error:
            getErrorMessage(
              error,
              "PDF to Excel conversion failed."
            ),
        });
    }
  }
);

/*
  POWERPOINT → PDF
*/

app.post(
  "/api/powerpoint-to-pdf",
  upload.single("file"),
  async (
    request,
    response
  ) => {
    try {
      const file =
        request.file;

      if (!file) {
        response
          .status(400)
          .json({
            error:
              "No PowerPoint file was uploaded.",
          });

        return;
      }

      if (
        !file.originalname
          .toLowerCase()
          .endsWith(
            ".pptx"
          )
      ) {
        response
          .status(400)
          .json({
            error:
              "Please upload a PPTX file.",
          });

        return;
      }

      console.log(
        `[Server] PowerPoint → PDF: ${file.originalname}`
      );

      const convertedPdf =
        await convertPptxToPdf(
          file.buffer
        );

      const outputName =
        file.originalname.replace(
          /\.pptx$/i,
          ".pdf"
        );

      response.setHeader(
        "Content-Type",
        "application/pdf"
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );

      response.setHeader(
        "Content-Length",
        convertedPdf.byteLength.toString()
      );

      response.send(
        convertedPdf
      );
    } catch (error) {
      logServerError(
        "PowerPoint to PDF conversion failed:",
        error
      );

      response
        .status(500)
        .json({
          error:
            getErrorMessage(
              error,
              "PowerPoint to PDF conversion failed."
            ),
        });
    }
  }
);

/*
  PDF → POWERPOINT
*/

app.post(
  "/api/pdf-to-powerpoint",
  upload.single("file"),
  async (
    request,
    response
  ) => {
    try {
      const file =
        request.file;

      if (!file) {
        response
          .status(400)
          .json({
            error:
              "No PDF file was uploaded.",
          });

        return;
      }

      if (
        !file.originalname
          .toLowerCase()
          .endsWith(
            ".pdf"
          )
      ) {
        response
          .status(400)
          .json({
            error:
              "Please upload a PDF file.",
          });

        return;
      }

      console.log(
        `[Server] PDF → PowerPoint: ${file.originalname}`
      );

      const convertedPowerPoint =
        await convertPdfToPptx(
          file.buffer
        );

      const outputName =
        file.originalname.replace(
          /\.pdf$/i,
          ".pptx"
        );

      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );

      response.setHeader(
        "Content-Length",
        convertedPowerPoint.byteLength.toString()
      );

      response.send(
        convertedPowerPoint
      );
    } catch (error) {
      logServerError(
        "PDF to PowerPoint conversion failed:",
        error
      );

      response
        .status(500)
        .json({
          error:
            getErrorMessage(
              error,
              "PDF to PowerPoint conversion failed."
            ),
        });
    }
  }
);

/*
  PDF OCR
*/
app.post(
  "/api/ocr-jobs",
  conversionRateLimiter,
  upload.single("file"),
  asyncHandler(
    async (
      request,
      response
    ) => {
      const file =
        validatePdfFile(
          request.file,
          {
            fieldName:
              "file",

            maximumSizeBytes:
              100 *
              1024 *
              1024,
          }
        );

      const requestedLanguage =
        typeof request.body
          .language ===
        "string"
          ? request.body.language.trim()
          : "";

      const language =
        requestedLanguage ||
        "en-US";

      if (
        language.length >
        35
      ) {
        throw badRequest(
          "The OCR language value is invalid."
        );
      }

      const originalName =
        file.originalname.replace(
          /\.pdf$/i,
          ""
        );

      const outputFilename =
        `${originalName}_searchable.pdf`;

      const job =
        createOcrJob({
          originalFilename:
            file.originalname,

          outputFilename,

          language,

          inputBuffer:
            file.buffer,
        });

      startOcrJob(
        job.id
      );

      const publicJob =
        getOcrJobPublicData(
          job.id
        );

      if (!publicJob) {
        throw notFound(
          "The OCR job could not be created."
        );
      }

      console.log(
        `[Server] OCR job created: ${job.id}`
      );

      response
        .status(202)
        .json({
          job:
            publicJob,
        });
    }
  )
);

app.get(
  "/api/ocr-jobs/:jobId",
  asyncHandler(
    async (
      request,
      response
    ) => {
      const rawJobId =
        request.params.jobId;

      const jobId =
        Array.isArray(
          rawJobId
        )
          ? rawJobId[0]
          : rawJobId;

      if (!jobId) {
        throw badRequest(
          "The OCR job ID is required."
        );
      }

      const job =
        getOcrJobPublicData(
          jobId
        );

      if (!job) {
        throw notFound(
          "The OCR job was not found or has expired."
        );
      }

      response.json({
        job,
      });
    }
  )
);
app.get(
  "/api/ocr-jobs/:jobId/result",
  asyncHandler(
    async (
      request,
      response
    ) => {
      const rawJobId =
        request.params.jobId;

      const jobId =
        Array.isArray(
          rawJobId
        )
          ? rawJobId[0]
          : rawJobId;

      if (!jobId) {
        throw badRequest(
          "The OCR job ID is required."
        );
      }

      const job =
        getOcrJobPublicData(
          jobId
        );

      if (!job) {
        throw notFound(
          "The OCR job was not found or has expired."
        );
      }

      if (
        job.status ===
        "failed"
      ) {
        throw conflict(
          job.error?.message ||
            "The OCR job failed."
        );
      }

      if (
        job.status ===
        "cancelled"
      ) {
        throw conflict(
          "The OCR job was cancelled."
        );
      }

      if (
        job.status !==
        "completed"
      ) {
        throw conflict(
          "The OCR job is still processing."
        );
      }

      const result =
        getOcrJobResult(
          jobId
        );

      if (!result) {
        throw conflict(
          "The OCR result is not ready."
        );
      }

      sendPdfResponse(
        response,
        result.buffer,
        {
          filename:
            result.filename,
        }
      );
    }
  )
);
app.delete(
  "/api/ocr-jobs/:jobId",
  asyncHandler(
    async (
      request,
      response
    ) => {
      const rawJobId =
        request.params.jobId;

      const jobId =
        Array.isArray(
          rawJobId
        )
          ? rawJobId[0]
          : rawJobId;

      if (!jobId) {
        throw badRequest(
          "The OCR job ID is required."
        );
      }

      const existingJob =
        getOcrJobPublicData(
          jobId
        );

      if (!existingJob) {
        throw notFound(
          "The OCR job was not found or has expired."
        );
      }

      const cancelledJob =
        cancelOcrJob(
          jobId
        );

      if (!cancelledJob) {
        throw notFound(
          "The OCR job was not found or has expired."
        );
      }

      const publicJob =
        getOcrJobPublicData(
          jobId
        );

      response.json({
        job:
          publicJob,
      });
    }
  )
);

/*
  INVOICE → PDF
*/

app.post(
  "/api/invoice-to-pdf",
  asyncHandler(
    async (
      request,
      response
    ) => {
      let invoice;

      try {
        invoice =
          validateInvoiceData(
            request.body
          );
      } catch (error) {
        throw badRequest(
          error instanceof Error
            ? error.message
            : "The invoice data is invalid."
        );
      }

      console.log(
        `[Server] Invoice → PDF: ${invoice.invoiceNumber}`
      );

      let invoicePdf: Buffer;

      try {
        invoicePdf =
          await generateInvoicePdf(
            invoice
          );
      } catch (error) {
        throw unprocessableContent(
          error instanceof Error
            ? error.message
            : "The invoice PDF could not be generated."
        );
      }

      const safeInvoiceNumber =
        invoice.invoiceNumber
          .replace(
            /[^a-zA-Z0-9._-]+/g,
            "-"
          )
          .replace(
            /^-+|-+$/g,
            ""
          ) || "invoice";

      const outputName =
        `${safeInvoiceNumber}.pdf`;

sendPdfResponse(
  response,
  invoicePdf,
  {
    filename: outputName,
  }
);
    }
  )
);

/*
  HTML → PDF
*/

app.post(
  "/api/html-to-pdf",
  asyncHandler(
    async (
      request,
      response
    ) => {
      let validatedRequest;

      try {
        validatedRequest =
          validateHtmlPdfRequest(
            request.body
          );
      } catch (error) {
        throw badRequest(
          error instanceof Error
            ? error.message
            : "The HTML-to-PDF request is invalid."
        );
      }

      console.log(
        `[Server] HTML → PDF: ${validatedRequest.filename}`
      );

      let pdfBuffer: Buffer;

      try {
        pdfBuffer =
          await generateHtmlPdf(
            validatedRequest
          );
      } catch (error) {
        throw unprocessableContent(
          error instanceof Error
            ? error.message
            : "The HTML document could not be rendered."
        );
      }

      sendPdfResponse(
  response,
  pdfBuffer,
  {
    filename:
      validatedRequest.filename,
  }
);
    }
  )
);

app.post(
  "/api/pdf/watermark",
  requireApiKey,
  upload.single("file"),
  asyncHandler(
    async (
      request,
      response
    ) => {
      const uploadedFile =
  validatePdfFile(
    request.file,
    {
      fieldName: "file",

      maximumSizeBytes:
        100 * 1024 * 1024,
    }
  );

      let validatedRequest;

      try {
        validatedRequest =
          validateWatermarkRequest({
            filename:
              request.body.filename,

            options:
              request.body.options,
          });
      } catch (error) {
        throw badRequest(
          error instanceof Error
            ? error.message
            : "The watermark options are invalid."
        );
      }

      console.log(
        `[Server] Watermark PDF: ${uploadedFile.originalname}`
      );

      let outputBuffer: Buffer;

      try {
        outputBuffer =
          await generateWatermarkedPdf(
            uploadedFile.buffer,
            validatedRequest
          );
      } catch (error) {
        throw unprocessableContent(
          error instanceof Error
            ? error.message
            : "The PDF could not be watermarked."
        );
      }

sendPdfResponse(
  response,
  outputBuffer,
  {
    filename:
      validatedRequest.filename,
  }
);
    }
  )
);

/*
  UNKNOWN API ROUTES

  Important:
  This must remain after every valid route.
*/

app.use(
  "/api",
  unknownApiRoute
);

app.use(
  apiErrorHandler
);

/*
  MULTER, CORS, AND SERVER ERRORS
*/

app.use(
  (
    error: unknown,
    _request:
      express.Request,
    response:
      express.Response,
    _next:
      express.NextFunction
  ) => {
    if (
      error instanceof
      multer.MulterError
    ) {
      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        response
          .status(413)
          .json({
            error:
              "The uploaded file exceeds the 100 MB limit.",
          });

        return;
      }

      response
        .status(400)
        .json({
          error:
            "The uploaded file could not be processed.",
        });

      return;
    }

    if (
      error instanceof Error &&
      error.message.includes(
        "is not allowed by CORS"
      )
    ) {
      console.warn(
        `[CORS] ${error.message}`
      );

      response
        .status(403)
        .json({
          error:
            "This website is not allowed to access the conversion server.",
        });

      return;
    }

    logServerError(
      "Unexpected server error:",
      error
    );

    response
      .status(500)
      .json({
        error:
          "An unexpected server error occurred.",
      });
  }
);

/*
  START SERVER
*/

const server =
  app.listen(
    port,
    () => {
      console.log(
        `Draflio Adobe server running at http://localhost:${port}`
      );

      console.log(
        `Health check: http://localhost:${port}/api/health`
      );

      console.log(
        `Environment: ${env.nodeEnv}`
      );
    }
  );

/*
  Allow enough time for document
  uploads and Adobe conversions.
*/

server.requestTimeout =
  10 * 60 * 1000;

server.headersTimeout =
  65 * 1000;

server.keepAliveTimeout =
  60 * 1000;

/*
  GRACEFUL SHUTDOWN
*/

let isShuttingDown =
  false;

async function shutdownServer(
  signal: string
) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown =
    true;

  console.log(
    `[Server] ${signal} received. Shutting down gracefully...`
  );

  closeConversionJobStore();

try {
  await closeHtmlPdfBrowser();
} catch (error) {
  console.error(
    "[Server] Chromium shutdown failed:",
    error
  );
}

  server.close(
    (error) => {
      if (error) {
        console.error(
          "[Server] Graceful shutdown failed:",
          error
        );

        process.exit(1);
      }

      console.log(
        "[Server] Shutdown complete."
      );

      process.exit(0);
    }
  );

  /*
    Force shutdown if an open connection
    prevents the server from closing.
  */
  setTimeout(
    () => {
      console.error(
        "[Server] Forced shutdown after timeout."
      );

      process.exit(1);
    },
    30_000
  ).unref();
}

process.on(
  "SIGINT",
  () => {
    shutdownServer(
      "SIGINT"
    );
  }
);

process.on(
  "SIGTERM",
  () => {
    shutdownServer(
      "SIGTERM"
    );
  }
);
