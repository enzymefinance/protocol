import '@enzymefinance/hardhat/types';

import type { ProtocolDeployment } from '@enzymefinance/testutils';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace globalThis {
    // eslint-disable-next-line no-var
    var fork: ProtocolDeployment;
  }

  // NOTE: Needed due to incorrect/intrusive typings in hardhat.
  namespace Mocha {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface MochaOptions {
      // NOTE: This is required to fix a type export problem in hardhat.
    }
  }
}
