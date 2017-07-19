const BigNumber = require('bignumber.js');
const AragonToken = artifacts.require('./AragonToken.sol');
const AventusToken = artifacts.require('./AventusToken.sol');
const BasicAttentionToken = artifacts.require('./BasicAttentionToken.sol');
const BancorToken = artifacts.require('./BancorToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const DigixDaoToken = artifacts.require('./DigixDaoToken.sol');
const DigixGoldToken = artifacts.require('./DigixGoldToken.sol');
const DogecoinToken = artifacts.require('./DogecoinToken.sol');
const EtherClassicToken = artifacts.require('./EtherClassicToken.sol');
const EtherToken = artifacts.require('./EtherToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
const GnosisToken = artifacts.require('./GnosisToken.sol');
const GolemToken = artifacts.require('./GolemToken.sol');
const IconomiToken = artifacts.require('./IconomiToken.sol');
const LitecoinToken = artifacts.require('./LitecoinToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
const RippleToken = artifacts.require('./RippleToken.sol');
const StatusToken = artifacts.require('./StatusToken.sol');
const SingularDTVToken = artifacts.require('./SingularDTVToken.sol');
const CryptoCompare = artifacts.require('./CryptoCompare.sol');
const Exchange = artifacts.require('./Exchange.sol');
const Universe = artifacts.require('./Universe.sol');

const PRICEFEED_ADDRESS = '0x442fd95c32162f914364c5feff27a0dc05214706';
const BITCOINTOKEN_ADDRESS = '0x9e4c56a633dd64a2662bdfa69de4fde33ce01bdd';
const ETHERTOKEN_ADDRESS = '0x7506c7bfed179254265d443856ef9bda19221cd7';
const REPTOKEN_ADDRESS = '0xf61b8003637e5d5dbb9ca8d799ab54e5082cbdbc';
const MELONTOKEN_ADDRESS = '0x4dffea52b0b4b48c71385ae25de41ce6ad0dd5a7';
const EUROTOKEN_ADDRESS = '0xc151b622fded233111155ec273bfaf2882f13703';

// const assetList = [
//   EtherToken,   // [0] refAsset token
//   MelonToken,   // [1] MLN token
//   AragonToken,  // rest alphabetical
//   AventusToken,
//   BasicAttentionToken,
//   BancorToken,
//   BitcoinToken,
//   DigixDaoToken,
//   DigixGoldToken,
//   DogecoinToken,
//   EtherClassicToken,
//   EuroToken,
//   GnosisToken,
//   GolemToken,
//   IconomiToken,
//   LitecoinToken,
//   RepToken,
//   RippleToken,
//   SingularDTVToken,
//   StatusToken,
// ];

const newAssetsList = [
  AragonToken,
  AventusToken,
  BasicAttentionToken,
  BancorToken,
  DigixDaoToken,
  // DigixGoldToken,
  DogecoinToken,
  EtherClassicToken,
  GnosisToken,
  GolemToken,
  IconomiToken,
  LitecoinToken,
  RippleToken,
  SingularDTVToken,
  StatusToken,
];

module.exports = (deployer, network, accounts) => {
  try {
    let feedBackupOwner;
    if (network === 'development') feedBackupOwner = accounts[0];
    else if (network === 'kovan') feedBackupOwner = accounts[0];
    deployer.deploy(newAssetsList.concat([Exchange]))
    .then(() => {
      const newAssetAddresses = newAssetsList.map(a => a.address);
      return deployer.deploy(
        CryptoCompare,
        ETHERTOKEN_ADDRESS,
        [
          MELONTOKEN_ADDRESS, BITCOINTOKEN_ADDRESS,
          EUROTOKEN_ADDRESS, REPTOKEN_ADDRESS,
        ],
        {gas: 4500000}
        //, value: new BigNumber(1000000000000000000)},
        //.concat(newAssetAddresses),
      )
    })
    // .then(() =>
    //   CryptoCompare.deployed()
    // )
    // .then(res =>
    //   res.ignite({ from: feedBackupOwner, value: new BigNumber(Math.pow(10, 16)) })
    // )
    // .then(() =>
    //   CryptoCompare.deployed()
    // )
    // .then(() =>
    //   res.updatePriceOraclize({ from: feedBackupOwner })
    // )
    // .then(() =>
    //   deployer.deploy(
    //     Universe,
    //     [
    //       ETHERTOKEN_ADDRESS, MELONTOKEN_ADDRESS, BITCOINTOKEN_ADDRESS,
    //       EUROTOKEN_ADDRESS, REPTOKEN_ADDRESS
    //     ].concat(newAssetAddresses),
    //     Array(assetList.length).fill(CryptoCompare.address),
    //     Array(assetList.length).fill(Exchange.address),
    //   )
    // )
  } catch (e) {
    throw e;
  }
};
