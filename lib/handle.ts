const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}
