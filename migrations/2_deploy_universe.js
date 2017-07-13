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

const assetList = [
  EtherToken,   // [0] refAsset token
  MelonToken,   // [1] MLN token
  AragonToken,  // rest alphabetical
  AventusToken,
  BasicAttentionToken,
  BancorToken,
  BitcoinToken,
  DigixDaoToken,
  DigixGoldToken,
  DogecoinToken,
  EtherClassicToken,
  EuroToken,
  GnosisToken,
  GolemToken,
  IconomiToken,
  LitecoinToken,
  RepToken,
  RippleToken,
  SingularDTVToken,
  StatusToken,
];
const cryptoCompareQuery = 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=MLN,BTC,EUR,REP&sign=true';


module.exports = async (deployer, network, accounts) => {
  try {
    let feedBackupOwner;
    if (network === 'development') feedBackupOwner = accounts[1];
    else if (network === 'kovan') feedBackupOwner = accounts[0];
    await deployer.deploy(assetList.concat([Exchange]));
    await deployer.deploy(CryptoCompare);
    await CryptoCompare.setQuery(cryptoCompareQuery, { from: feedBackupOwner });
    await CryptoCompare.updatePriceOraclize({ from: feedBackupOwner });
    await deployer.deploy(
      Universe,
      assetList.map(a => a.address),
      Array(assetList.length).fill(CryptoCompare.address),
      Array(assetList.length).fill(Exchange.address),
    );
  } catch (e) {
    throw e;
  }
};
