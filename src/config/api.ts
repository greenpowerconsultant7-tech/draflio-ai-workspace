const configuredApiUrl =
  import.meta.env
    .VITE_API_BASE_URL
    ?.trim();

if (
  !configuredApiUrl &&
  import.meta.env.PROD
) {
  throw new Error(
    "VITE_API_BASE_URL is required in production."
  );
}

export const API_BASE_URL =
  (
    configuredApiUrl ||
    "http://localhost:3001"
  ).replace(
    /\/+$/,
    ""
  );