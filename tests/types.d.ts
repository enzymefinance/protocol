import { ethers } from 'ethers';

declare global {
  var ethersProvider: ethers.providers.Provider;
  var ethersSigners: ethers.Signer[];
}
