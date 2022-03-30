import { providers } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { History } from './history';
import { SignerWithAddress } from './signer';
import type { FixtureCreator } from './snapshots';
import { Snapshots } from './snapshots';

export class EthereumTestnetProvider extends providers.StaticJsonRpcProvider {
  public readonly snapshots = new Snapshots(this);
  public readonly history = new History();

  constructor(public readonly env: HardhatRuntimeEnvironment) {
    super();
  }

  public async snapshot<TFixture>(create: FixtureCreator<TFixture, this>, id?: string): Promise<TFixture> {
    return this.snapshots.snapshot(create, id);
  }

  public send(method: string, params: any): Promise<any> {
    return this.env.network.provider.send(method, params);
  }

  public async getSignerWithAddress(addressOrIndex: number | string) {
    return SignerWithAddress.create(await this.getSigner(addressOrIndex));
  }
}
