import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type AbortableTask<TResult> = (
  signal: AbortSignal
) => Promise<TResult>;

export type AbortableTaskResult<TResult> = {
  run: (
    task: AbortableTask<TResult>
  ) => Promise<TResult | undefined>;

  cancel: () => void;

  isRunning: boolean;
};

export function useAbortableTask<TResult>():
  AbortableTaskResult<TResult> {
  const controllerRef =
    useRef<AbortController | null>(
      null
    );

  const taskIdRef =
    useRef(0);

  const [
    isRunning,
    setIsRunning,
  ] = useState(false);

  const cancel =
    useCallback(() => {
      controllerRef.current?.abort();

      controllerRef.current =
        null;

      taskIdRef.current += 1;

      setIsRunning(false);
    }, []);

  const run =
    useCallback(
      async (
        task: AbortableTask<TResult>
      ): Promise<
        TResult | undefined
      > => {
        controllerRef.current?.abort();

        const controller =
          new AbortController();

        const taskId =
          taskIdRef.current + 1;

        taskIdRef.current =
          taskId;

        controllerRef.current =
          controller;

        setIsRunning(true);

        try {
          const result =
            await task(
              controller.signal
            );

          if (
            controller.signal.aborted ||
            taskIdRef.current !==
              taskId
          ) {
            return undefined;
          }

          return result;
        } finally {
          if (
            taskIdRef.current ===
              taskId
          ) {
            controllerRef.current =
              null;

            setIsRunning(false);
          }
        }
      },
      []
    );

  useEffect(
    () => {
      return () => {
        controllerRef.current?.abort();

        controllerRef.current =
          null;
      };
    },
    []
  );

  return {
    run,
    cancel,
    isRunning,
  };
}