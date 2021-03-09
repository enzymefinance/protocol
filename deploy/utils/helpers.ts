export function nonOptional<T>(array: (T | undefined)[]): T[] {
  return array.filter((item) => item !== undefined) as T[];
}
