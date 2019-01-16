import { Address } from '@melonproject/token-math';

const isSameAddress = (a: Address | string, b: Address | string) =>
  a.toLowerCase() === b.toLowerCase();

export { isSameAddress };
