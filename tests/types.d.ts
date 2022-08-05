import '@enzymefinance/hardhat/types';

declare global {
  // NOTE: Needed due to incorrect/intrusive typings in hardhat.
  namespace Mocha {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface MochaOptions {
      // NOTE: This is required to fix a type export problem in hardhat.
    }
  }
}
