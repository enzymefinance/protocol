import { ethers } from 'ethers';
import ganache from 'ganache-core';
import config from '~/ganache/config';
import { CallHistory } from '~/framework/ganache/history';

export type FixtureCreator<TFixture> = (
  provider: GanacheProvider,
) => Promise<TFixture>;

export interface Snapshot<TFixture> {
  data: TFixture;
  id: string;
}

export class GanacheProvider extends ethers.providers.Web3Provider {
  public readonly snapshots = new Map<FixtureCreator<any>, Snapshot<any>>();
  public readonly accounts: ethers.Wallet[];

  public static fork(
    fork: string | ganache.Provider = `http://127.0.0.1:${config.forkPort}`,
    accounts = config.forkAccounts,
  ) {
    return this.create({ fork, accounts });
  }

  public static create(options?: ganache.IProviderOptions) {
    const provider = ganache.provider(options);
    const state = (provider as any)?.manager?.state;
    const accounts = Object.values(state.accounts).map((account: any) => {
      return new ethers.Wallet(account.secretKey);
    });

    const history = new CallHistory(provider);
    return new this(provider as any, accounts, history);
  }

  constructor(
    provider: ethers.providers.ExternalProvider,
    accounts: ethers.Wallet[],
    public readonly history: CallHistory,
  ) {
    super(provider);
    // Connect the given accountcontractss to this provider instance.
    this.accounts = accounts.map((account) => account.connect(this));
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      ((this.provider as any) as ganache.Provider).close(() => resolve());
    });
  }

  public async snapshot<T>(
    creator: FixtureCreator<T> = () => Promise.resolve(null as any),
  ): Promise<T> {
    if (this.snapshots.has(creator)) {
      const snapshot = this.snapshots.get(creator)!;

      await this.send('evm_revert', [snapshot.id]);
      this.history.clear();

      return snapshot.data;
    }

    const data = await creator(this);
    const id = await this.send('evm_snapshot', []);

    this.snapshots.set(creator, { id, data });
    this.history.clear();

    return data;
  }
}
