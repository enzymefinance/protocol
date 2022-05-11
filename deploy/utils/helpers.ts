import { providers } from 'ethers';

export function nonOptional<T>(array: (T | undefined)[]): T[] {
  return array.filter((item) => item !== undefined) as T[];
}

function getNetwork(id: number | string) {
  return providers.getNetwork(Number(id));
}

function isNetwork(id: number | string, name: string) {
  return getNetwork(id).name === name;
}

export enum Network {
  'HOMESTEAD' = 'homestead',
  'MATIC' = 'matic',
}

export function isHomestead(id: number | string) {
  return isNetwork(id, Network.HOMESTEAD);
}

export function isMatic(id: number | string) {
  return isNetwork(id, Network.MATIC);
}

export function isOneOfNetworks(id: number | string, networks: Network[]) {
  const network = getNetwork(id).name;

  return networks.includes(network as Network);
}
