import { extractEventFromLogs } from '@enzymefinance/ethers';
import type { BigNumber } from 'ethers';
import { providers, utils } from 'ethers';
import type { Receipt } from 'hardhat-deploy/types';

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

export function getListId(receipt: Receipt, offset = 0): BigNumber {
  const fragment = utils.EventFragment.from(
    'ListCreated(address indexed creator, address indexed owner, uint256 id, uint8 updateType)',
  );

  const events = extractEventFromLogs(receipt.logs ?? [], fragment);
  const event = events[offset];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!event) {
    throw new Error(`Missing ListCreated event with offset ${offset} in transaction receipt`);
  }

  const id = event.args.id;

  if (id === undefined) {
    throw new Error('Missing id in ListCreated event');
  }

  return id;
}
