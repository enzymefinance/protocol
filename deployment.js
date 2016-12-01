import Web3 from 'web3';
import PriceFeedAsset from './build/contracts/PriceFeed.sol.js';

const web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

// CONSTANTS
/*TODO deploy token contracts*/
const TOKEN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
];

// creation of contract object
const OWNER = web3.eth.coinbase;
console.log('Owner is: \t', OWNER);

// Init Contract
var MyContract = web3.eth.contract(PriceFeedAsset.abi);
const code = PriceFeedAsset.unlinked_binary;
// deploy new contract
var contractInstance = MyContract.new({data: code, from: OWNER}, (err, myContract) => {
    if(!err) {
       // NOTE: The callback will fire twice!
       // Once the contract has the transactionHash property set and once its deployed on an address.

       // e.g. check tx hash on the first call (transaction send)
       if(!myContract.address) {
           console.log('TX Hash is: \t', myContract.transactionHash) // The hash of the transaction, which deploys the contract

       // check address on the second call (contract deployed)
       } else {
           console.log('Contract Address is: \t', myContract.address) // the contract address
       }
       
       // Note that the returned "myContractReturned" === "myContract",
       // so the returned "myContractReturned" object will also get the address set.
    }
  });
