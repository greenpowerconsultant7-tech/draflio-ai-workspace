import createQpdfModule, {
  type QpdfInstance,
} from "@neslinesli93/qpdf-wasm";

type WritableQpdfFileSystem =
  QpdfInstance["FS"] & {
    writeFile: (
      path: string,
      data: Uint8Array
    ) => void;

    unlink: (path: string) => void;
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
    qpdfModulePromise = createQpdfModule({
      locateFile: () =>
        "/wasm/qpdf.wasm",
    }).then(
      (qpdf) =>
        qpdf as unknown as BrowserQpdfInstance
    );
  }

  return qpdfModulePromise;
}

function safeUnlink(
  qpdf: BrowserQpdfInstance,
  path: string
) {
  try {
    qpdf.FS.unlink(path);
  } catch {
    // File may not exist.
  }
}

class UnlockService {
  async unlock(
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
      `/unlock-input-${uniqueId}.pdf`;

    const outputPath =
      `/unlock-output-${uniqueId}.pdf`;

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
          `--password=${password}`,
          "--decrypt",
          inputPath,
          outputPath,
        ]);

      if (exitCode !== 0) {
        throw new Error(
          `QPDF exited with code ${exitCode}.`
        );
      }

      const outputBytes =
        qpdf.FS.readFile(outputPath);

      return new Uint8Array(
        outputBytes
      );
    } finally {
      safeUnlink(qpdf, inputPath);
      safeUnlink(qpdf, outputPath);
    }
  }
}

export const unlockService =
  new UnlockService();