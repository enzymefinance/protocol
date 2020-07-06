import { ethers } from 'ethers';
import {
  resolveArguments,
  getArtifact,
  getArtifactAddress,
} from '~/framework/utils';

export class TransactionWrapper<
  TOverrides extends ethers.Overrides = ethers.Overrides
> {
  public readonly args: Promise<any[]>;

  constructor(
    public readonly contract: Contract,
    public readonly fragment: ethers.utils.FunctionFragment,
    public readonly signature: string,
    args?: any[],
  ) {
    const internal = this.contract.$$ethers;
    this.args = resolveArguments(internal.signer, this.fragment.inputs, args);
  }

  public async populate(
    overrides?: TOverrides,
  ): Promise<ethers.UnsignedTransaction> {
    const args = await this.args;
    const overridez = overrides || {};
    return this.contract.$$ethers.populateTransaction[this.signature](
      ...args,
      overridez,
    );
  }

  public async call(overrides?: ethers.CallOverrides): Promise<any> {
    const args = await this.args;
    const overridez = overrides || {};
    return this.contract.$$ethers.callStatic[this.signature](
      ...args,
      overridez,
    );
  }

  public async estimate(overrides?: TOverrides): Promise<ethers.BigNumber> {
    const args = await this.args;
    const overridez = overrides || {};
    return this.contract.$$ethers.estimateGas[this.signature](
      ...args,
      overridez,
    );
  }

  public async send(overrides?: TOverrides): Promise<ethers.ContractReceipt> {
    const args = await this.args;
    const overridez = overrides || {};
    const tx = await this.contract.$$ethers.functions[this.signature](
      ...args,
      overridez,
    );

    // We don't have a use-case for observing tx confirmation. Return the receipt promise right away.
    return (tx as ethers.ContractTransaction).wait();
  }
}

export class DeploymentTransactionWrapper<
  TContract extends Contract = Contract
> {
  public readonly interface: ethers.utils.Interface;
  public readonly args: Promise<any[]>;

  constructor(
    public readonly contract: SpecificContract<TContract>,
    public readonly signer: ethers.Signer,
    args: any[] = [],
  ) {
    this.interface = new ethers.utils.Interface(contract.abi);
    this.args = resolveArguments(
      this.signer,
      this.interface.deploy.inputs,
      args,
    );
  }

  public async populate(
    overrides?: ethers.CallOverrides,
  ): Promise<ethers.UnsignedTransaction> {
    const overridez = (ethers.utils.shallowCopy(
      overrides ?? {},
    ) as any) as ethers.UnsignedTransaction;
    const args = await this.args;
    // Set the data to the bytecode and the encoded constructor arguments.
    const artifact = getArtifact(this.contract);
    const data = ethers.utils.hexlify(
      ethers.utils.concat([
        artifact.bytecode,
        this.interface.encodeDeploy(args),
      ]),
    );

    return { ...overridez, data };
  }

  public async call(overrides?: ethers.CallOverrides): Promise<any> {
    const tx = await this.populate(overrides);
    return this.signer.call(tx);
  }

  public async estimate(
    overrides?: ethers.Overrides,
  ): Promise<ethers.BigNumber> {
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
  new (
    addressOrName: string,
    signerOrProvider?: ethers.Signer | ethers.providers.Provider,
  ): TContract;
  abi: string[];
}

export abstract class Contract {
  /**
   * The contract abi.
   */
  public static readonly abi: string[];

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
    ethers.utils.defineReadOnly(
      instance.$$ethers,
      'deployTransaction',
      response,
    );

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
      throw new Error(
        `Failed to retrieve address from artifact for contract ${implementation.name}`,
      );
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
  constructor(
    addressOrName: string,
    signerOrProvider?: ethers.Signer | ethers.providers.Provider,
  ) {
    this.interface = new ethers.utils.Interface(new.target.abi);

    // TODO: Completely replace the ethers.Contract implementation with a custom
    // version that is more tightly tailored for our use case.
    this.$$ethers = new ethers.Contract(
      addressOrName,
      this.interface,
      signerOrProvider,
    );

    const uniques = Object.keys(this.interface.functions).filter(
      (signature, index, array) => {
        const fragment = this.interface.functions[signature];
        const found = array.findIndex((item) => {
          return this.$$ethers.interface.functions[item].name === fragment.name;
        });

        return index === found;
      },
    );

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
        const resolved = await resolveArguments(
          this.$$ethers.provider,
          fragment.inputs,
          args,
        );

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

  public attach(addressOrName: string): this {
    const provider = this.$$ethers.signer ?? this.$$ethers.provider;
    return new (<SpecificContract>this.constructor)(
      addressOrName,
      provider,
    ) as this;
  }

  public connect(
    providerOrSigner: ethers.providers.Provider | ethers.Signer,
  ): this {
    const address = this.$$ethers.address;
    return new (<SpecificContract>this.constructor)(
      address,
      providerOrSigner,
    ) as this;
  }
}
