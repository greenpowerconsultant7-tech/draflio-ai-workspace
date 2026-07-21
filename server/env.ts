import dotenv from "dotenv";
import {
  z,
} from "zod";

dotenv.config({
  path: ".env.server",
});

const environmentSchema =
  z.object({
    PDF_SERVICES_CLIENT_ID:
      z
        .string()
        .trim()
        .min(
          1,
          "PDF_SERVICES_CLIENT_ID is required."
        ),

    PDF_SERVICES_CLIENT_SECRET:
      z
        .string()
        .trim()
        .min(
          1,
          "PDF_SERVICES_CLIENT_SECRET is required."
        ),

    ADOBE_SERVER_PORT:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(65_535)
        .default(3001),

    FRONTEND_ORIGINS:
      z
        .string()
        .trim()
        .default(
          "http://localhost:8080,http://127.0.0.1:8080"
        ),

    TRUST_PROXY:
      z
        .enum([
          "true",
          "false",
        ])
        .default("false"),

    NODE_ENV:
      z
        .enum([
          "development",
          "test",
          "production",
        ])
        .default(
          "development"
        ),
  });

const validationResult =
  environmentSchema.safeParse(
    process.env
  );

if (
  !validationResult.success
) {
  console.error(
    "\nInvalid backend environment configuration:"
  );

  for (
    const issue of
    validationResult.error.issues
  ) {
    console.error(
      `- ${issue.path.join(".")}: ${issue.message}`
    );
  }

  console.error(
    "\nCheck your .env.server file.\n"
  );

  throw new Error(
    "Backend environment validation failed."
  );
}

const validatedEnvironment =
  validationResult.data;

export const env = {
  adobeClientId:
    validatedEnvironment
      .PDF_SERVICES_CLIENT_ID,

  adobeClientSecret:
    validatedEnvironment
      .PDF_SERVICES_CLIENT_SECRET,

  port:
    validatedEnvironment
      .ADOBE_SERVER_PORT,

  frontendOrigins:
    validatedEnvironment
      .FRONTEND_ORIGINS
      .split(",")
      .map((origin) =>
        origin.trim()
      )
      .filter(Boolean),

  trustProxy:
    validatedEnvironment
      .TRUST_PROXY ===
    "true",

  nodeEnv:
    validatedEnvironment
      .NODE_ENV,

  isProduction:
    validatedEnvironment
      .NODE_ENV ===
    "production",
} as const;