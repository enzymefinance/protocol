import Web3 from "web3";
import ethers from 'ethers';

declare global {
  var web3: Web3;
  var ethersProvider: ethers.providers.Provider;
  var ethersSigners: ethers.Signer[];
}
