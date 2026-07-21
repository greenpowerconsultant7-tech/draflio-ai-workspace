export type FetchWithTimeoutOptions =
  RequestInit & {
    timeoutMs?: number;
  };

export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(
    timeoutMs: number
  ) {
    super(
      `The request timed out after ${Math.round(
        timeoutMs / 1000
      )} seconds.`
    );

    this.name =
      "RequestTimeoutError";

    this.timeoutMs =
      timeoutMs;

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options:
    FetchWithTimeoutOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 120_000,
    signal: externalSignal,
    ...requestOptions
  } = options;

  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new Error(
      "The request timeout must be greater than zero."
    );
  }

  const controller =
    new AbortController();

  let timedOut = false;

  const abortFromExternalSignal =
    () => {
      controller.abort(
        externalSignal?.reason
      );
    };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternalSignal();
    } else {
      externalSignal.addEventListener(
        "abort",
        abortFromExternalSignal,
        {
          once: true,
        }
      );
    }
  }

  const timeoutId =
    window.setTimeout(
      () => {
        timedOut = true;

        controller.abort();
      },
      timeoutMs
    );

  try {
    return await fetch(
      input,
      {
        ...requestOptions,
        signal:
          controller.signal,
      }
    );
  } catch (error) {
    if (timedOut) {
      throw new RequestTimeoutError(
        timeoutMs
      );
    }

    throw error;
  } finally {
    window.clearTimeout(
      timeoutId
    );

    externalSignal?.removeEventListener(
      "abort",
      abortFromExternalSignal
    );
  }
}