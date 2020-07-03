import path from 'path';
import fs from 'fs';
import { ethers } from 'ethers';
import addresses from '~/config';

// TODO: Properly type the truffle build artifact.
export type Artifact = any;
export type AddressLike = string | Contract;

export const artifactDirectory = path.join(__dirname, '..', '..', 'build', 'contracts');
export const mainnetContractAddresses = Object.values(addresses).reduce((carry, current) => {
  return { ...carry, ...current };
}, {} as { [key: string]: string | undefined });
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
    return mainnetContractAddresses[name];
  }

  return undefined;
}

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

export async function resolveAddress(
  value: AddressLike | Promise<AddressLike>,
) {
  const resolved = await value;
  if (typeof resolved === 'string' && resolved.startsWith('0x')) {
    return resolved;
  }

  if (Contract.isContract(resolved)) {
    if (resolved.$$ethers.address) {
      return resolved.$$ethers.address;
    }

    if (resolved.$$ethers.deployTransaction) {
      const contract = await resolved.$$ethers.deployed();
      return contract.address;
    }
  }

  throw new Error(`Failed to resolve address for contract ${resolved.name}`);
}

export async function resolveArguments(
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  type: ethers.utils.ParamType | ethers.utils.ParamType[],
  value: any,
): Promise<any> {
  const resolved = await value;
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
  protected resolvedArgs?: Promise<any[]>;

  constructor(
    public readonly contract: Contract,
    public readonly fragment: ethers.utils.FunctionFragment,
    public readonly signature: string,
    public readonly rawArgs?: any[]
  ) {}

  public async args() {
    if (this.resolvedArgs == null) {
      const provider = this.contract.$$ethers.provider;
      this.resolvedArgs = resolveArguments(provider, this.fragment.inputs, this.rawArgs || []);
    }

    return this.resolvedArgs;
  }

  public async populate(overrides?: TOverrides): Promise<ethers.UnsignedTransaction> {
    const args = await this.args();
    return this.contract.$$ethers.populateTransaction[this.signature](...args, overrides || {});
  }

  public async call(overrides?: ethers.CallOverrides): Promise<any> {
    const args = await this.args();
    return this.contract.$$ethers.callStatic[this.signature](...args, overrides || {});
  }

  public async estimate(overrides?: TOverrides): Promise<ethers.BigNumber> {
    const args = await this.args();
    return this.contract.$$ethers.estimateGas[this.signature](...args, overrides || {});
  }

  public async send(overrides?: TOverrides): Promise<ethers.ContractReceipt> {
    const args = await this.args();
    const tx = await this.contract.$$ethers.functions[this.signature](...args, overrides || {});
    // We don't have a use-case for observing tx confirmation. Return the receipt promise right away.
    return (tx as ethers.ContractTransaction).wait();
  }
}

export class DeploymentTransactionWrapper<TContract extends Contract = Contract> {
  public readonly interface: ethers.utils.Interface;
  protected resolvedArgs?: Promise<any[]>;

  constructor(
    public readonly contract: SpecificContract<TContract>,
    public readonly signer: ethers.Signer,
    protected readonly rawArgs?: any[],
  ) {
    this.interface = new ethers.utils.Interface(contract.abi);
  }

  public async args() {
    if (this.resolvedArgs == null) {
       this.resolvedArgs = resolveArguments(this.signer, this.interface.deploy.inputs, this.rawArgs || []);
    }

    return this.resolvedArgs;
  }

  public async populate(overrides?: ethers.CallOverrides): Promise<ethers.UnsignedTransaction> {
    const overridez = (ethers.utils.shallowCopy(overrides ?? {}) as any) as ethers.UnsignedTransaction;
    const args = await this.args();

    // Set the data to the bytecode and the encoded constructor arguments.
    const artifact = getArtifact(this.contract);
    const data = ethers.utils.hexlify(ethers.utils.concat([artifact.bytecode, this.interface.encodeDeploy(args)]));
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
  public static isContract(value: Contract | any): value is SpecificContract & Contract {
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
      (this as any)[fragment.name] = async (...args: any[]) => {
        const resolved = await resolveArguments(this.$$ethers.provider, fragment.inputs, args);
        return this.$$ethers.callStatic[fragment.name](...resolved);
      };
    });

    transactions.forEach((signature) => {
      const fragment = this.interface.functions[signature];
      (this as any)[fragment.name] = (...args: any[]) => {
        return new TransactionWrapper(this, fragment, signature, args);
      };
    });
  }
}
