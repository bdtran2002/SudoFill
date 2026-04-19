import { getWebExtensionApi } from './webext';

type PromiseLikeApi = {
  [key: string]: (...args: unknown[]) => unknown;
};

export async function callWebExtensionApi<T>(
  namespace: keyof Pick<typeof chrome, 'runtime' | 'tabs' | 'storage' | 'alarms'>,
  methodPath: string,
  ...args: unknown[]
): Promise<T> {
  const api = getWebExtensionApi()[namespace] as unknown as PromiseLikeApi | undefined;
  const method = methodPath
    .split('.')
    .reduce<
      PromiseLikeApi | ((...args: unknown[]) => unknown) | undefined
    >((current, key) => (current as PromiseLikeApi | undefined)?.[key], api) as
    | ((...args: unknown[]) => unknown)
    | undefined;
  const result = method?.(...args);
  return Promise.resolve(result) as Promise<T>;
}
