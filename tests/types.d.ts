import '@enzymefinance/hardhat/types';
import { ProtocolDeployment, WhaleSigners } from '@enzymefinance/testutils';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace globalThis {
    // eslint-disable-next-line no-var
    var whales: WhaleSigners;
    // eslint-disable-next-line no-var
    var fork: ProtocolDeployment;
  }
}
