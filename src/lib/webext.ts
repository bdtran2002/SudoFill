export function getWebExtensionApi() {
  return (
    (
      globalThis as typeof globalThis & {
        browser?: typeof chrome;
      }
    ).browser ?? chrome
  );
}
