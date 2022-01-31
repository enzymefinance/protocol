import '@enzymefinance/hardhat/types';

import type { ProtocolDeployment, WhaleSigners } from '@enzymefinance/testutils';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace globalThis {
    // eslint-disable-next-line no-var
    var whales: WhaleSigners;
    // eslint-disable-next-line no-var
    var fork: ProtocolDeployment;
  }

  // NOTE: Needed due to incorrect/intrusive typings in hardhat.
  namespace Mocha {
    type MochaOptions = any;
  }
}
