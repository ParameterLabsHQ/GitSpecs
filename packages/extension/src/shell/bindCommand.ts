/**
 * Wrap an async command handler so VS Code can pass TreeView context args
 * (e.g. the clicked TreeItem) through to the handler.
 */
export function bindCommand<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
  hooks: {
    onSuccess: () => void;
    onError: (err: unknown) => void | Promise<void>;
  },
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
      hooks.onSuccess();
    } catch (err) {
      await hooks.onError(err);
    }
  };
}
