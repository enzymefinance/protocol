import path from 'path';
import fs from 'fs';
import { ethers } from 'ethers';
import addresses from '~/config';

// TODO: Properly type the truffle build artifact.
export type Artifact = any;
export type AddressLike = string | Contract;

export const artifactDirectory = path.join(__dirname, '..', '..', 'build', 'contracts');

/**
 * Loads a truffle build artifact object given it's filename.
 *
 * @param name The name of the truffle build artifact.
 */
export function getArtifact(contract: SpecificContract): Artifact {
  const artifactPath = path.join(artifactDirectory, `${contract.name}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing artifact for contract ${contract.name}`);
  }

  try {
    const artifact = fs.readFileSync(artifactPath, 'utf8');
    return JSON.parse(artifact);
  } catch (error) {
    throw new Error(`Failed to load artifact for contract ${contract.name}: ${error.toString()}`)
  }
}

/**
 * Retrieves the address of a deployed contract.
 *
 * @param artifact The artifact payload.
 * @param network The network id. Defaults to 1.
 */
export function getArtifactAddress(artifact: Artifact, network: number = 1): string | undefined {
  if (artifact.networks[network]?.address) {
    return artifact.networks[network]?.address
  }

  if (network === 1) {
    const name = artifact.contractName;
    const values = Object.values(addresses);
    const flattened: { [key: string]: string } = values.reduce((carry, current) => {
      return { ...carry, ...current };
    }, {});

    return flattened[name];
  }

  return undefined;
}

export async function resolveAddressOrName(
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  value: AddressLike | Promise<AddressLike>,
) {
  const resolved = await resolveAddress(value);
  return signerOrProvider.resolveName(resolved);
}

export async function resolveAddress(
  value: AddressLike | Promise<AddressLike>,
) {
  const resolved = await Promise.resolve(value);
  if (Contract.isContract(resolved)) {
    const contract = await resolved.$$ethers.deployed();
    return contract.address;
  }

  return resolved;
}

export async function resolveArguments(
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  type: ethers.utils.ParamType | ethers.utils.ParamType[],
  value: any,
): Promise<any> {
  const resolved = await Promise.resolve(value);
  if (Array.isArray(type)) {
    return Promise.all(
      type.map((type, index) => {
        const value = Array.isArray(resolved) ? resolved[index] : resolved[type.name];
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

    return Promise.all(resolved.map((value) => resolveArguments(signerOrProvider, type.arrayChildren, value)));
  }

  return resolved;
}

export class TransactionWrapper<TOverrides extends ethers.Overrides = ethers.Overrides> {
  constructor(public readonly contract: Contract, public readonly signature: string, public readonly args?: any[]) {}

  public populate(overrides?: TOverrides): Promise<ethers.UnsignedTransaction> {
    return this.contract.$$ethers.populateTransaction[this.signature](...(this.args || []), overrides || {});
  }

  public call(overrides?: ethers.CallOverrides): Promise<any> {
    return this.contract.$$ethers.callStatic[this.signature](...(this.args || []), overrides || {});
  }

  public estimate(overrides?: TOverrides): Promise<ethers.BigNumber> {
    return this.contract.$$ethers.estimateGas[this.signature](...(this.args || []), overrides || {});
  }

  public send(overrides?: TOverrides): Promise<ethers.providers.TransactionResponse> {
    return this.contract.$$ethers.functions[this.signature](...(this.args || []), overrides || {});
  }
}

export class DeploymentTransactionWrapper<TContract extends Contract = Contract> {
  public interface: ethers.utils.Interface;

  constructor(
    public readonly contract: SpecificContract<TContract>,
    public readonly bytecode: string,
    public readonly signer: ethers.Signer,
    public readonly args?: any[],
  ) {
    this.interface = new ethers.utils.Interface(contract.abi);
  }

  public async populate(overrides?: ethers.CallOverrides): Promise<ethers.UnsignedTransaction> {
    const args = await resolveArguments(this.signer, this.interface.deploy.inputs, this.args);
    const overridez = (ethers.utils.shallowCopy(overrides ?? {}) as any) as ethers.UnsignedTransaction;

    // Set the data to the bytecode and the encoded constructor arguments.
    const data = ethers.utils.hexlify(ethers.utils.concat([this.bytecode, this.interface.encodeDeploy(args)]));
    return { ...overridez, data };
  }

  public async call(overrides?: ethers.CallOverrides): Promise<any> {
    const tx = await this.populate(overrides);
    return this.signer.call(tx);
  }

  public async estimate(overrides?: ethers.Overrides): Promise<ethers.BigNumber> {
    const tx = await this.populate(overrides);
    return this.signer.estimateGas(tx);
  }

  public async send(overrides?: ethers.Overrides): Promise<TContract> {
    const tx = await this.populate(overrides);
    const response = await this.signer.sendTransaction(tx);
    return Contract.fromDeployment(this.contract, response, this.signer);
  }
}

export interface SpecificContract<TContract extends Contract = Contract> {
  new (addressOrName: string, signerOrProvider?: ethers.Signer | ethers.providers.Provider): TContract;
  abi: string[];
}

export abstract class Contract {
  /**
   * The contract abi.
   */
  public static readonly abi: string[];

  /**
   * Checks if the given object is a contract instance.
   *
   * @param value The suspected contract instance.
   * @returns true if the given value is a contract, false otherwise.
   */
  public static isContract(value: Contract | any): value is Contract {
    if (value instanceof Contract) {
      return true;
    }

    if (value.interface && ethers.utils.Interface.isInterface(value.interface)) {
      return true;
    }

    return false;
  }

  /**
   *
   * @param implementation
   * @param response
   * @param signerOrProvider
   */
  public static fromDeployment<TContract extends Contract = Contract>(
    implementation: SpecificContract<TContract>,
    response: ethers.providers.TransactionResponse,
    signerOrProvider?: ethers.Signer | ethers.providers.Provider,
  ) {
    const address = ethers.utils.getContractAddress(response);
    const instance = new implementation(address, signerOrProvider);

    // TODO: Remove this once we have our own completely custom contract object.
    ethers.utils.defineReadOnly(instance.$$ethers, 'deployTransaction', response);

    return instance;
  }

  /**
   *
   * @param implementation
   * @param signer
   */
  public static fromArtifact<TContract extends Contract = Contract>(
    implementation: SpecificContract<TContract>,
    signerOrProvider?: ethers.Signer | ethers.providers.Provider,
  ) {
    const address = this.artifactAddress(implementation);
    return new implementation(address, signerOrProvider);
  }

  /**
   *
   * @param implementation
   */
  public static artifactAddress(implementation: SpecificContract): string {
    const address = getArtifactAddress(getArtifact(implementation));
    if (!address) {
      throw new Error(`Failed to retrieve address from artifact for contract ${implementation.name}`);
    }

    return address;
  }

  /**
   * The contract interface.
   */
  public readonly interface: ethers.utils.Interface;

  /**
   * The underlying ethers.js contract instance.
   */
  public readonly $$ethers: ethers.Contract;

  /**
   * Constructs a new contract instance.
   *
   * @param addressOrName The address or name of the contract.
   * @param signerOrProvider The ethers.js signer or provider instance to use.
   */
  constructor(addressOrName: string, signerOrProvider?: ethers.Signer | ethers.providers.Provider) {
    this.interface = new ethers.utils.Interface(new.target.abi);

    // TODO: Completely replace the ethers.Contract implementation with a custom version that is more tightly tailored for our use case.
    this.$$ethers = new ethers.Contract(ethers.utils.getAddress(addressOrName), this.interface, signerOrProvider);

    const uniques = Object.keys(this.interface.functions).filter((signature, index, array) => {
      const fragment = this.interface.functions[signature];
      return index === array.findIndex((item) => this.$$ethers.interface.functions[item].name === fragment.name);
    });

    const calls = uniques.filter((signature) => {
      const fragment = this.interface.functions[signature];
      return fragment.constant;
    });

    const transactions = uniques.filter((signature) => {
      const fragment = this.interface.functions[signature];
      return !fragment.constant;
    });

    calls.forEach((signature) => {
      const fragment = this.interface.functions[signature];
      (this as any)[fragment.name] = this.$$ethers.functions[signature];
    });

    transactions.forEach((signature) => {
      const fragment = this.interface.functions[signature];
      (this as any)[fragment.name] = (...args: any[]) => new TransactionWrapper(this, signature, args);
    });
  }
}
