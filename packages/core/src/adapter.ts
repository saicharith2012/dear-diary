/**
 * Tiny holder for a platform implementation that the core injects at app
 * startup. Explicit injection (rather than `.native.ts` / `.web.ts` file
 * extensions) keeps the Next.js build free of custom webpack resolution and
 * keeps Metro free of a custom resolver — each app just calls the setter once.
 */
export interface AdapterSlot<T> {
  set(impl: T): void;
  get(): T;
  /** True once an implementation is available (injected or defaulted). */
  isSet(): boolean;
}

export function createAdapterSlot<T>(
  name: string,
  fallback?: T,
): AdapterSlot<T> {
  let current: T | undefined = fallback;
  return {
    set(impl: T) {
      current = impl;
    },
    get(): T {
      if (current === undefined) {
        throw new Error(
          `No ${name} adapter configured. Call set${name[0]!.toUpperCase()}${name.slice(1)}Adapter() during app startup.`,
        );
      }
      return current;
    },
    isSet() {
      return current !== undefined;
    },
  };
}
