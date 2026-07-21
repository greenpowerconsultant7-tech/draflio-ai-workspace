import createQpdfModule, {
  type QpdfInstance,
} from "@neslinesli93/qpdf-wasm";

type WritableQpdfFileSystem =
  QpdfInstance["FS"] & {
    writeFile: (
      path: string,
      data: Uint8Array
    ) => void;

    unlink: (
      path: string
    ) => void;
  };

type BrowserQpdfInstance = Omit<
  QpdfInstance,
  "FS"
> & {
  FS: WritableQpdfFileSystem;
};

let qpdfModulePromise:
  | Promise<BrowserQpdfInstance>
  | null = null;

function getQpdfModule(): Promise<BrowserQpdfInstance> {
  if (!qpdfModulePromise) {
    qpdfModulePromise =
      createQpdfModule({
        locateFile: () =>
          "/wasm/qpdf.wasm",
      }).then(
        (qpdf) =>
          qpdf as unknown as BrowserQpdfInstance
      );
  }

  return qpdfModulePromise;
}

function createOwnerPassword() {
  const randomBytes =
    new Uint8Array(32);

  crypto.getRandomValues(
    randomBytes
  );

  return Array.from(
    randomBytes
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function safeUnlink(
  qpdf: BrowserQpdfInstance,
  path: string
) {
  try {
    qpdf.FS.unlink(path);
  } catch {
    // The file may not exist.
  }
}

class ProtectService {
  async protect(
    file: File,
    password: string
  ): Promise<Uint8Array> {
    if (!password) {
      throw new Error(
        "Password is required."
      );
    }

    const qpdf =
      await getQpdfModule();

    const uniqueId =
      crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`;

    const inputPath =
      `/protect-input-${uniqueId}.pdf`;

    const outputPath =
      `/protect-output-${uniqueId}.pdf`;

    const ownerPassword =
      createOwnerPassword();

    try {
      const inputBytes =
        new Uint8Array(
          await file.arrayBuffer()
        );

      qpdf.FS.writeFile(
        inputPath,
        inputBytes
      );

      const exitCode =
        qpdf.callMain([
          inputPath,

          "--encrypt",
          password,
          ownerPassword,
          "256",
          "--",

          outputPath,
        ]);

      if (exitCode !== 0) {
        throw new Error(
          `QPDF exited with code ${exitCode}.`
        );
      }

      const outputBytes =
        qpdf.FS.readFile(
          outputPath
        );

      return new Uint8Array(
        outputBytes
      );
    } finally {
      safeUnlink(
        qpdf,
        inputPath
      );

      safeUnlink(
        qpdf,
        outputPath
      );
    }
  }
}

export const protectService =
  new ProtectService();