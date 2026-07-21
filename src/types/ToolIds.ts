export const ToolIds = {
  MERGE: "merge-pdf",
  SPLIT: "split",
  ROTATE: "rotate",
  COMPRESS: "compress",
  WATERMARK: "watermark",
  PROTECT: "protect",
  UNLOCK: "unlock",
  OCR: "smart-ocr",
  CHAT: "ai-chat",
} as const;

export type ToolId = typeof ToolIds[keyof typeof ToolIds];