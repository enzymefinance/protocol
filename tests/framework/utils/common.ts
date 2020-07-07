import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import addresses from '~/config';
import { Contract, SpecificContract } from '~/framework/contract';
import { Artifact, AddressLike } from '~/framework/types';
import { contracts } from '~/framework';

export const artifactDir = path.join(__dirname, '../../../build/contracts');
export const mainnetContractAddresses = Object.values(addresses).reduce(
  (carry, current) => {
    return { ...carry, ...current };
  },
  {} as { [key: string]: string | undefined },
);

/**
 * Loads a truffle build artifact object given it's filename.
 *
 * @param name The name of the truffle build artifact.
 */
export function getArtifact(contract: SpecificContract): Artifact {
  const artifactPath = path.join(artifactDir, `${contract.name}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing artifact for contract ${contract.name}`);
  }

  try {
    const artifact = fs.readFileSync(artifactPath, 'utf8');
    return JSON.parse(artifact);
  } catch (error) {
    throw new Error(
      `Failed to load artifact for contract ${
        contract.name
      }: ${error.toString()}`,
    );
  }
}

/**
 * @todo Write this.
 *
 * @param implementation
 * @param response
 * @param signerOrProvider
 */
export function fromDeployment<TContract extends Contract = Contract>(
  implementation: SpecificContract<TContract>,
  response: ethers.ContractTransaction,
  signerOrProvider?: ethers.Signer | ethers.providers.Provider,
) {
  const address = ethers.utils.getContractAddress(response);
  const instance = new implementation(address, signerOrProvider);

  // TODO: Remove this once we have our own completely custom contract object.
  ethers.utils.defineReadOnly(instance.$$ethers, 'deployTransaction', response);

  return instance;
}

/**
 * @todo Write this.
 *
 * @param implementation
 * @param signer
 */
export function fromArtifact<TContract extends Contract = Contract>(
  implementation: SpecificContract<TContract>,
  signerOrProvider?: ethers.Signer | ethers.providers.Provider,
) {
  const address = getArtifactAddress(getArtifact(implementation));
  if (!address) {
    throw new Error(
      `Failed to retrieve address from artifact for contract ${implementation.name}`,
    );
  }

  return new implementation(address, signerOrProvider);
}

/**
 * Retrieves the address of a deployed contract.
 *
 * @param artifact The artifact payload.
 * @param network The network id. Defaults to 1.
 */
export function getArtifactAddress(
  artifact: Artifact,
  network: number = 1,
): string | undefined {
  if (artifact.networks[network]?.address) {
    return artifact.networks[network]?.address;
  }

  if (network === 1) {
    const name = artifact.contractName;
    return mainnetContractAddresses[name];
  }

  return undefined;
}

/**
 * Checks if the given object is a contract instance.
 *
 * @param value The suspected contract instance.
 * @returns true if the given value is a contract, false otherwise.
 */
export function isContract(
  value: Contract | any,
): value is SpecificContract & Contract {
  if (value instanceof Contract) {
    return true;
  }

  if (value.interface && ethers.utils.Interface.isInterface(value.interface)) {
    return true;
  }

  return false;
}

/**
 * Checks if the given object is a signer.
 *
 * @param value The suspected signer.
 * @returns true if the given value is a signer, false otherwise.
 */
export function isWallet(value: Contract | any): value is ethers.Wallet {
  if (value instanceof ethers.Wallet) {
    return true;
  }

  return false;
}

/**
 * @todo Write this.
 *
 * @param signerOrProvider
 * @param value
 */
export async function resolveAddressOrName(
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  value: AddressLike | Promise<AddressLike>,
) {
  const resolved = await resolveAddress(value);
  if (resolved.startsWith('0x')) {
    return resolved;
  }

  return signerOrProvider.resolveName(resolved);
}

/**
 * @todo Write this.
 *
 * @param value
 */
export async function resolveAddress(
  value: AddressLike | Promise<AddressLike>,
) {
  const resolved = await value;
  if (typeof resolved === 'string' && resolved.startsWith('0x')) {
    return resolved;
  }

  if (isWallet(resolved)) {
    return resolved.getAddress();
  }

  if (isContract(resolved)) {
    if (resolved.$$ethers.address) {
      return resolved.$$ethers.address;
    }

    if (resolved.$$ethers.deployTransaction) {
      const contract = await resolved.$$ethers.deployed();
      return contract.address;
    }

    throw new Error(`Failed to resolve address for contract ${resolved.name}`);
  }

  throw new Error('Failed to resolve address');
}

/**
 * @todo Write this.
 *
 * @param signerOrProvider
 * @param type
 * @param value
 */
export async function resolveArguments(
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  type: ethers.utils.ParamType | ethers.utils.ParamType[],
  value: any,
): Promise<any> {
  const resolved = await value;
  if (Array.isArray(type)) {
    return Promise.all(
      type.map((type, index) => {
        const value = Array.isArray(resolved)
          ? resolved[index]
          : resolved[type.name];

        return resolveArguments(signerOrProvider, type, value);
      }),
    );
  }

  if (type.type === 'address') {
    return resolveAddressOrName(signerOrProvider, resolved);
  }

  if (type.type === 'tuple') {
    return resolveArguments(signerOrProvider, type.components, resolved);
  }

  if (type.baseType === 'array') {
    if (!Array.isArray(resolved)) {
      throw new Error('Invalid value for array.');
    }

    return Promise.all(
      resolved.map((value) => {
        return resolveArguments(signerOrProvider, type.arrayChildren, value);
      }),
    );
  }

  return resolved;
}

/**
 * @todo Write this.
 *
 * @param value
 * @param numBytes
 */
export const stringToBytes = (value: string, numBytes: number = 32) => {
  const string = Buffer.from(value, 'utf8').toString('hex');
  const prefixed = string.startsWith('0x') ? string : `0x${string}`;
  return ethers.utils.hexZeroPad(prefixed, numBytes);
};

/**
 * @todo Write this.
 *
 * @param types
 * @param args
 */
export function encodeArgs(
  types: (string | ethers.utils.ParamType)[],
  args: any[],
) {
  const hex = ethers.utils.defaultAbiCoder.encode(types, args);
  return ethers.utils.arrayify(hex);
}

export async function transferToken(
  token: contracts.IERC20,
  to: AddressLike,
  amount: ethers.BigNumberish = ethers.utils.parseEther('1'),
) {
  const address = await resolveAddress(to);
  return token.transfer(address, amount).send();
}

export async function approveToken(
  token: contracts.IERC20,
  spender: AddressLike,
  amount: ethers.BigNumberish = ethers.utils.parseEther('1'),
) {
  const address = await resolveAddress(spender);
  return token.approve(address, amount).send();
}
