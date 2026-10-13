type GuardLogger = Pick<Console, "error" | "warn">;

type FatalHandler = (error: unknown) => void | Promise<void>;

type ProcessGuardOptions = {
  logger?: GuardLogger;
  exit?: (code: number) => void;
};

let installed = false;
let fatalHandler: FatalHandler | null = null;
let exitImpl: (code: number) => void = (code) => process.exit(code);

export function setFatalHandler(handler: FatalHandler | null): void {
  fatalHandler = handler;
}

export function isProcessGuardsInstalled(): boolean {
  return installed;
}

function describe(error: unknown): string {
  if (error instanceof Error)
    return error.stack ?? `${error.name}: ${error.message}`;
  return String(error);
}

export function installProcessGuards(options: ProcessGuardOptions = {}): void {
  if (installed) return;
  installed = true;

  const logger = options.logger ?? console;
  if (options.exit) exitImpl = options.exit;

  process.on("unhandledRejection", (reason) => {
    logger.error(
      `[guard] unhandledRejection — logged and continuing:\n${describe(reason)}`,
    );
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      `[guard] uncaughtException — process state is unknown, draining:\n${describe(error)}`,
    );

    if (!fatalHandler) {
      exitImpl(1);
      return;
    }

    try {
      const result = fatalHandler(error);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((shutdownError: unknown) => {
          logger.error(
            `[guard] graceful shutdown after uncaughtException failed:\n${describe(shutdownError)}`,
          );
          exitImpl(1);
        });
      }
    } catch (shutdownError) {
      logger.error(
        `[guard] graceful shutdown after uncaughtException failed:\n${describe(shutdownError)}`,
      );
      exitImpl(1);
    }
  });
}

export function removeProcessGuardsForTest(): void {
  if (!installed) return;
  process.removeAllListeners("unhandledRejection");
  process.removeAllListeners("uncaughtException");
  installed = false;
  fatalHandler = null;
  exitImpl = (code) => process.exit(code);
}
