import dotenv from "dotenv";

dotenv.config({
  path: ".env.server",
});

function getRequiredEnvironmentVariable(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} was not found in .env.server.`
    );
  }

  return value;
}

const clientId =
  getRequiredEnvironmentVariable(
    "PDF_SERVICES_CLIENT_ID"
  );

const clientSecret =
  getRequiredEnvironmentVariable(
    "PDF_SERVICES_CLIENT_SECRET"
  );

async function checkAdobeAuthentication() {
  try {
    const formData =
      new URLSearchParams();

    formData.set(
      "client_id",
      clientId
    );

    formData.set(
      "client_secret",
      clientSecret
    );

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(() => {
        controller.abort();
      }, 30000);

    try {
      const response = await fetch(
        "https://pdf-services.adobe.io/token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body: formData,

          signal: controller.signal,
        }
      );

      if (response.ok) {
        console.log(
          "Adobe authentication successful."
        );

        return;
      }

      console.error(
        `Adobe authentication failed. Status: ${response.status}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error(
      "Adobe authentication request failed:",
      error
    );
  }
}

void checkAdobeAuthentication();