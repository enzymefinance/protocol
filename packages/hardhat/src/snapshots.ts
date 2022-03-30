import type { EthereumTestnetProvider } from './provider';

export type FixtureCreator<TFixture, TProvider extends EthereumTestnetProvider = any> = (
  provider: TProvider,
) => Promise<TFixture>;

export interface Snapshot<TFixture> {
  data: TFixture;
  id: string;
}

export class Snapshots<TProvider extends EthereumTestnetProvider = EthereumTestnetProvider> {
  private readonly snapshots = new Map<FixtureCreator<any, TProvider> | string, Snapshot<any>>();

  constructor(private readonly provider: TProvider) {}

  public async snapshot<TFixture>(create: FixtureCreator<TFixture, TProvider>, id?: string): Promise<TFixture> {
    const revert = this.snapshots.get(id ?? create);
    const snapshot = revert ? await this.revert<TFixture>(revert, create) : await this.record<TFixture>(create);

    this.snapshots.set(id ?? create, snapshot);
    this.provider.history.clear();

    return snapshot.data;
  }

  private async record<TFixture>(create: FixtureCreator<TFixture, TProvider>): Promise<Snapshot<TFixture>> {
    const data = await create(this.provider);
    const id = await this.provider.send('evm_snapshot', []);

    return { data, id };
  }

  private async revert<TFixture>(
    snapshot: Snapshot<TFixture>,
    create: FixtureCreator<TFixture, TProvider>,
  ): Promise<Snapshot<TFixture>> {
    // NOTE: If reverting fails, re-create the snapshot but notify the user.
    //
    // This can happen when the user tries to jump between snapshots in the wrong
    // order. E.g. after creating snapshot 0x2 and then jumping back to 0x1, the
    // 0x2 snapshot is wiped again (obviously). Subsequentially, jumping to 0x2
    // is a no-op.
    //
    // TODO: Consider a different api, e.g. with a non-global provider and instead
    // using a more explicit snapshot-first approach where each test ("it()") has
    // to be primed explicitly (with an optional snapshot) to even obtain a provider
    // instance.
    if (!(await this.provider.send('evm_revert', [snapshot.id]))) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const name = create.name ?? 'unknown';

      console.warn(`
WARNING: Tried to revert to invalid snapshot ${snapshot.id} (name: "${name}").

Are you trying to revert to a child snapshot after previously reverting to its ancestor? Child snapshots are wiped whenever you return to an ancestor.

We are going to restore the snapshot state by re-running the provided function. You should fix the snapshot succession in your tests to benefit from the performance improvement of state snapshotting.
      `);

      return this.record(create);
    }

    const id = await this.provider.send('evm_snapshot', []);

    return { ...snapshot, id };
  }

  public toJSON() {
    return {};
  }
}
