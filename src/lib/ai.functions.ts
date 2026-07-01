import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { DRAFLIO_TOOLS } from "./draflio-tools";

const TOOL_IDS = DRAFLIO_TOOLS.map((t) => t.id) as [string, ...string[]];

/**
 * Draflio AI Command Bar — maps a natural-language intent to the right workflow.
 * Returns the top tool + up to 2 alternatives, a short plan, and a friendly reply.
 */
export const routeCommand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ prompt: z.string().min(2).max(2000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured. Missing LOVABLE_API_KEY.");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const catalog = DRAFLIO_TOOLS
      .map((t) => `- ${t.id}: ${t.name} — ${t.description}`)
      .join("\n");

    const system = `You are Draflio AI, an intelligent document workspace router.
The user describes what they want to do with their document(s).
Pick the single best tool from the catalog below (by id), plus up to 2 alternatives.
Explain your reasoning in one crisp sentence and produce a short 3-step plan.

Tool catalog:
${catalog}

Be decisive. Never invent tool ids that are not in the catalog.`;

    try {
      const { experimental_output } = await generateText({
        model,
        system,
        prompt: data.prompt,
        experimental_output: Output.object({
          schema: z.object({
            tool: z.enum(TOOL_IDS),
            alternatives: z.array(z.enum(TOOL_IDS)).max(2).default([]),
            reply: z.string().min(4).max(280),
            plan: z.array(z.string()).min(1).max(4),
          }),
        }),
      });
      return experimental_output;
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      if (err.statusCode === 429) throw new Error("Rate limit reached — please retry in a moment.");
      if (err.statusCode === 402) throw new Error("AI credits exhausted for this workspace.");
      throw new Error(err.message || "AI routing failed.");
    }
  });

/**
 * Simulated document intelligence for the hero demo & Health Check card.
 * (Real PDF parsing lives in dedicated tools; this returns structural analysis
 * for any uploaded file so the workspace UX feels alive on turn 1.)
 */
export const analyzeDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      fileName: z.string(),
      fileSize: z.number().nonnegative(),
      mimeType: z.string().optional().default(""),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const { experimental_output } = await generateText({
      model,
      system:
        "You are Draflio's Document Health Check. Given only metadata about an uploaded file, produce a plausible, professional-looking analysis card. Be concise and specific. Never claim to have read the contents.",
      prompt: `File: ${data.fileName}\nSize: ${(data.fileSize / (1024 * 1024)).toFixed(2)} MB\nType: ${data.mimeType}`,
      experimental_output: Output.object({
        schema: z.object({
          language: z.string(),
          documentType: z.enum(["digital", "scanned", "mixed", "unknown"]),
          estimatedPages: z.number().int().min(1).max(2000),
          hasImages: z.boolean(),
          hasTables: z.boolean(),
          hasSignatures: z.boolean(),
          ocrRequired: z.boolean(),
          estimatedAccuracy: z.number().min(70).max(100),
          estimatedProcessingSeconds: z.number().min(1).max(600),
          summary: z.string().min(10).max(240),
          recommendedTools: z.array(z.enum(TOOL_IDS)).min(1).max(4),
        }),
      }),
    });
    return experimental_output;
  });
