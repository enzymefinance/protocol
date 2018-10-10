import * as fs from "fs";
import * as pkgInfo from "../../package.json";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
// import * as exchangeInfo from "../info/exchangeInfo";
import {deployContract, retrieveContract} from "../lib/contracts";
import api from "../lib/api";
import web3 from "../lib/web3";
import governanceAction from "../lib/governanceAction";
import getChainTime from "../../utils/lib/getChainTime";
import createStakingFeed from "../lib/createStakingFeed";
import {clone} from "../lib/misc";
import {abiEncode} from "../lib/data";
// import verifyDeployment from "./verify";

const BigNumber = require("bignumber.js");

// Constants and mocks
const addressBookFile = "./addressBook.json";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const yearInSeconds = 60 * 60 * 24 * 365;


async function getFundComponents(hubAddress) {
  let components = {};
  components.hub = await retrieveContract("fund/hub/Hub", hubAddress);
  const participationAddress = await components.hub.methods.participation().call();
  const sharesAddress = await components.hub.methods.shares().call();
  const tradingAddress = await components.hub.methods.trading().call();
  const policyManagerAddress = await components.hub.methods.policyManager().call();
  components.participation = await retrieveContract("fund/participation/Participation", participationAddress);
  components.shares = await retrieveContract("fund/shares/Shares", sharesAddress);
  components.trading = await retrieveContract("fund/trading/Trading", tradingAddress);
  components.policyManager = await retrieveContract("fund/policies/PolicyManager", policyManagerAddress);
  console.log(`Hub: ${hubAddress}`);
  console.log(`Participation: ${participationAddress}`);
  console.log(`Trading: ${tradingAddress}`);
  console.log(`Shares: ${sharesAddress}`);
  console.log(`PolicyManager: ${policyManagerAddress}`);
  const routes = await components.hub.methods.settings().call();
  components = Object.assign(components, {
    accounting: await retrieveContract("fund/accounting/Accounting", routes.accounting),
    feeManager: await retrieveContract("fund/fees/FeeManager", routes.feeManager),
    participation: await retrieveContract("fund/participation/Participation", routes.participation),
    policyManager: await retrieveContract("fund/policies/PolicyManager", routes.policyManager),
    shares: await retrieveContract("fund/shares/Shares", routes.shares),
    trading: await retrieveContract("fund/trading/Trading", routes.trading),
    vault: await retrieveContract("fund/vault/Vault", routes.vault),
  });
  return components;
}

// TODO: make clearer the separation between deployments in different environments
// TODO: make JSdoc style documentation tags here
async function deployEnvironment(environment) {
  const config = masterConfig[environment];
  if (config === undefined) {
    throw new Error(`Deployment for environment ${environment} not defined`);
  } else {
    const nodeNetId = await api.net.version();
    if(nodeNetId !== config.networkId && config.networkId !== "*") {
      throw new Error(`Network ID of node (${nodeNetId}) did not match ID in config "${environment}" (${config.networkId})`);
    }
  }
  const accounts = await api.eth.accounts();
  const opts = {
    from: accounts[0],
    gas: 8000000,
    gasPrice: config.gasPrice,
  };

  // TODO: put signature functions in a lib and use across all tests/utils
  const makeOrderSignature = api.util.abiSignature('makeOrder', [
    'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
  ]).slice(0,10);
  const takeOrderSignature = api.util.abiSignature('takeOrder', [
    'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
  ]).slice(0,10);
  const cancelOrderSignature = api.util.abiSignature('cancelOrder', [
    'address', 'address[5]', 'uint256[8]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
  ]).slice(0,10);

  const deployed = {};

  if (environment === "kovan" || environment === "kovanCompetition") {
    // const deploymentAddress = "0x4288c8108837bd04bc656ee3aeb8e643f79a0756";
    const deploymentAddress = "0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd";
    opts.from = deploymentAddress;
    /* eslint-disable global-require */
    const previous = require('../../addressBook.json').kovan;
    const commonEnvironment = "kovan";
    // set up governance and tokens
    deployed.Governance = await deployContract("system/Governance", opts, [[deploymentAddress], 1, yearInSeconds]);
    const mlnAddr = tokenInfo[commonEnvironment]["MLN-T"].address;
    const ethTokenAddress = tokenInfo[commonEnvironment]["WETH-T"].address;
    const chfAddress = '0x0';
    // const chfAddress = tokenInfo[commonEnvironment]["CHF-T"].address;
    const mlnToken = await retrieveContract("assets/Asset", mlnAddr);

    deployed.CanonicalPriceFeed = await retrieveContract("pricefeeds/CanonicalPriceFeed", previous.CanonicalPriceFeed);
//     deployed.StakingPriceFeed = await retrieveContract("pricefeeds/StakingPriceFeed", previous.StakingPriceFeed);
//     deployed.MatchingMarket = await retrieveContract("exchange/thirdparty/MatchingMarket", previous.MatchingMarket);
//     deployed.MatchingMarketAdapter = await retrieveContract("exchange/adapter/MatchingMarketAdapter", previous.MatchingMarketAdapter);
//     deployed.ZeroExTokenTransferProxy = await retrieveContract("exchange/thirdparty/0x/TokenTransferProxy", previous.ZeroExTokenTransferProxy);
//     deployed.ZeroExExchange = await retrieveContract("exchange/thirdparty/0x/Exchange", previous.ZeroExExchange);
//     deployed.ZeroExV1Adapter = await retrieveContract("exchange/adapter/ZeroExV1Adapter", previous.ZeroExV1Adapter);

    // set up pricefeeds
    // deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
    //   mlnAddr,
    //   ethTokenAddress,
    //   'Eth Token',
    //   'WETH-T',
    //   18,
    //   'ethereum.org',
    //   mockBytes,
    //   [mockAddress, mockAddress],
    //   [],
    //   [],
    //   [
    //     config.protocol.pricefeed.interval,
    //     config.protocol.pricefeed.validity
    //   ], [
    //     config.protocol.staking.minimumAmount,
    //     config.protocol.staking.numOperators,
    //     config.protocol.staking.unstakeDelay
    //   ],
    //   deployed.Governance.options.address
    // ], () => {}, true);

    // below not needed right now (TODO: remove in cleanup if still here)
    // deployed.StakingPriceFeed = await createStakingFeed(opts, deployed.CanonicalPriceFeed);
    // await mlnToken.instance.approve.postTransaction(
    //   opts,
    //   [
    //     deployed.StakingPriceFeed.options.address,
    //     config.protocol.staking.minimumAmount
    //   ]
    // );
    // await deployed.StakingPriceFeed.instance.depositStake.postTransaction(
    //   opts, [config.protocol.staking.minimumAmount, ""]
    // );

    // // set up exchanges and adapters
    // deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [154630446100]); // number is expiration date for market
    // deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);

    // const quoteSymbol = "WETH-T";
    // const pairsToWhitelist = [];
    // config.protocol.pricefeed.assetsToRegister.forEach((sym) => {
    //   if (sym !== quoteSymbol)
    //     pairsToWhitelist.push([quoteSymbol, sym]);
    // });

    // for (const pair of pairsToWhitelist) {
    //   console.log(`Whitelisting ${pair}`);
    //   const tokenA = tokenInfo[commonEnvironment][pair[0]].options.address;
    //   const tokenB = tokenInfo[commonEnvironment][pair[1]].options.address;
    //   await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(opts, [tokenA, tokenB]);
    // }

    deployed.MatchingMarket = await retrieveContract("exchange/thirdparty/MatchingMarket", previous.MatchingMarket);
    deployed.MatchingMarketAdapter = await retrieveContract("exchange/adapter/MatchingMarketAdapter", previous.MatchingMarketAdapter);

    deployed.ZeroExTokenTransferProxy = await retrieveContract("exchange/thirdparty/0x/TokenTransferProxy", previous.ZeroExTokenTransferProxy);
    deployed.ZeroExExchange = await retrieveContract("exchange/thirdparty/0x/Exchange", previous.ZeroExExchange)
    deployed.ZeroExV1Adapter = await retrieveContract("exchange/adapter/ZeroExV1Adapter", previous.ZeroExV1Adapter)

    // deployed.ZeroExTokenTransferProxy = await deployContract(
    //   "exchange/thirdparty/0x/TokenTransferProxy", opts
    // );
    // deployed.ZeroExExchange = await deployContract("exchange/thirdparty/0x/Exchange", opts,
    //   [ "0x0", deployed.ZeroExTokenTransferProxy.options.address ]
    // );
    // deployed.ZeroExV1Adapter = await deployContract("exchange/adapter/ZeroExV1Adapter", opts);
    // await deployed.ZeroExTokenTransferProxy.instance.addAuthorizedAddress.postTransaction(
    //   opts, [ deployed.ZeroExExchange.options.address ]
    // );

    // set up modules and version
    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.OnlyManager = await deployContract("compliance/OnlyManager", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.NoComplianceCompetition = await deployContract("compliance/NoComplianceCompetition", opts, []);
    deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [deploymentAddress]);
    const complianceAddress = (environment === "kovan" ? deployed.NoComplianceCompetition.options.address : deployed.CompetitionCompliance.options.address);
    deployed.Version = await deployContract(
      "version/Version",
      opts,
      [
        pkgInfo.version, deployed.Governance.options.address, mlnAddr,
        ethTokenAddress, deployed.CanonicalPriceFeed.options.address, complianceAddress
      ],
      () => {}, true
    );
    deployed.FundRanking = await deployContract("FundRanking", opts);
    const blockchainTime = await getChainTime();

    deployed.Competition = await deployContract(
      "competitions/Competition",
      opts,
      [
        mlnAddr, chfAddress, deployed.Version.options.address, deploymentAddress,
        blockchainTime, blockchainTime + 8640000, 20 * 10 ** 18, 10 ** 24, 1000, false
      ]
    );
    await deployed.Competition.instance.batchAddToWhitelist.postTransaction(
      opts,
      [10 ** 25, [deploymentAddress, "0xa80b5f4103c8d027b2ba88be9ed9bb009bf3d46f"]]
    );
    if (environment === "kovanCompetition") {
      await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(opts, [deployed.Competition.options.address]);
    } else if (environment === "kovan") {
      deployed.TestCompetition = await deployContract(
        "competitions/TestCompetition",
        opts,
        [
          mlnAddr, chfAddress, deployed.Version.options.address, deploymentAddress, blockchainTime,
          blockchainTime + 8640000, 20 * 10 ** 18, 10 ** 24, 1000, false
        ]
      );
    }
    await mlnToken.instance.transfer.postTransaction(opts,
      [deployed.Competition.options.address, 10 ** 22],
    );
    // add Version to Governance tracking
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.options.address]);

    // // whitelist exchanges
    // await governanceAction(
    //   opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    //   [
    //     deployed.MatchingMarket.options.address,
    //     deployed.MatchingMarketAdapter.options.address,
    //     true,
    //     [
    //       makeOrderSignature,
    //       takeOrderSignature,
    //       cancelOrderSignature
    //     ]
    //   ]
    // );
    // console.log('Registered MatchingMarket');

    // await governanceAction(
    //  opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    //   [
    //     "0x90fe2af704b34e0224bf2299c838e04d4dcf1364",
    //     "0x33A844A83cb7407C74C15fC862dEacCeC8B4EeF6",
    //     // deployed.ZeroExExchange.options.address,
    //     // deployed.ZeroExV1Adapter.options.address,
    //     false,
    //     [ takeOrderSignature ]
    //   ]
    // );
    // console.log('Registered ZeroEx');

    // // register assets
    // for (const assetSymbol of config.protocol.pricefeed.assetsToRegister) {
    //   console.log(`Registering ${assetSymbol}`);
    //   const tokenEntry = tokenInfo[commonEnvironment][assetSymbol];
    //   await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
    //     tokenEntry.options.address,
    //     tokenEntry.name,
    //     assetSymbol,
    //     tokenEntry.decimals,
    //     tokenEntry.url,
    //     mockBytes,
    //     [mockAddress, mockAddress],
    //     [],
    //     []
    //   ]);
    //   console.log(`Registered ${assetSymbol}`);
    // }
  } else if (environment === "live") {
    // const deployer = config.protocol.deployer;
    const pricefeedUpdater = config.protocol.pricefeed.updater;
    // const pricefeedUpdaterPassword = '';
    // const authority = config.protocol.governance.authorities[0];
    // const authorityPassword = '';
    opts.from = pricefeedUpdater;
    // const mlnAddr = tokenInfo[environment].MLN.address;
    // const ethTokenAddress = tokenInfo[environment]["WETH"].address;

    // deployed.Governance = await deployContract("system/Governance", {from: deployer}, [
    //   config.protocol.governance.authorities,
    //   config.protocol.governance.quorum,
    //   config.protocol.governance.window
    // ]);

    deployed.Governance = await retrieveContract("system/Governance", "0x630f5e265112dB10D1e7820E26718172a12BD084");

    // await unlock(authority, authorityPassword);
    // deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed",
    //   {from: authority, gas: 6900000 },
    //   [
    //     mlnAddr,
    //     ethTokenAddress,
    //     'Melon Token',
    //     'MLN',
    //     18,
    //     mockBytes,
    //     mockBytes,
    //     [mockAddress, mockAddress],
    //     [],
    //     [],
    //     [
    //       config.protocol.pricefeed.interval,
    //       config.protocol.pricefeed.validity,
    //     ], [
    //       config.protocol.staking.minimumAmount,
    //       config.protocol.staking.numOperators,
    //       config.protocol.staking.unstakeDelay
    //     ],
    //     pricefeedUpdater,  // single address performing update calls instead of multisig
    //     // deployed.Governance.options.address,
    //   ],
    //   () => {}, true
    // );

    deployed.CanonicalPriceFeed = await retrieveContract("pricefeeds/CanonicalPriceFeed", "0x4e224B5500FB9D6456069039D27c1E989429EAb7");

    // exchanges should already be deployed (third-party) and assets should be whitelisted

    // // deploy exchange adapters
    // deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);
    // deployed.ZeroExV1Adapter = await deployContract("exchange/adapter/ZeroExV1Adapter", opts);

    // // retrieve exchange adapters (instead of deploy)
    deployed.MatchingMarketAdapter = await retrieveContract("exchange/adapter/MatchingMarketAdapter", "0x752e85aE6297B17f42c1619008Ad8c2271f1C30f");
    deployed.ZeroExV1Adapter = await retrieveContract("exchange/adapter/ZeroExV1Adapter", "0x4A3943269C581eFCbd0875A7c60Da1C35a7C85c2");
    deployed.BugBountyCompliance = await retrieveContract("compliance/BugBountyCompliance", "0xD42316be0E813104096ab537FeE2fe0f5076bB2F");
    deployed.Version = await retrieveContract("version/Version", "0x569D8c4408005AD48C7fA439BE926476ec0e96b4");

    // deployed.OnlyManager = await deployContract("compliance/OnlyManager", {from: deployer});
    // deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [deployer]);
    // deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", {from: deployer});
    // deployed.Version = await deployContract(
    //   "version/Version",
    //   {from: deployer, gas: 6900000},
    //   [
    //     pkgInfo.version, deployed.Governance.options.address, mlnAddr, ethTokenAddress,
    //     deployed.CanonicalPriceFeed.options.address, deployed.BugBountyCompliance.options.address
    //   ], () => {}, true
    // );

    // deployed.Fundranking = await deployContract("FundRanking", {from: deployer});

    // add Version to Governance tracking
    // NB: be sure that relevant authority account is unlocked
    // console.log('Adding version to Governance tracking');
    // await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.options.address]);

    // NB: this is not needed when using third-party exchanges
    // // whitelist exchanges
    // // TODO: make sure that authority account is unlocked for this section
    // console.log('registering exchange');
    // await governanceAction(
    //   opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
    //   [
    //     // TODO: replace with deployed MatchingMarket
    //     // deployed.MatchingMarket.options.address,
    //     "0x14fbca95be7e99c15cc2996c6c9d841e54b79425",
    //     deployed.MatchingMarketAdapter.options.address,
    //     true,
    //     [
    //       makeOrderSignature,
    //       takeOrderSignature,
    //       cancelOrderSignature
    //     ]
    //   ]
    // );

    // console.log('registering exchange');
    // await deployed.CanonicalPriceFeed.instance.registerExchange.postTransaction(
    //   opts,
    //   [
    //     "0x14fbca95be7e99c15cc2996c6c9d841e54b79425",
    //     deployed.MatchingMarketAdapter.options.address,
    //     true,
    //     [
    //       makeOrderSignature,
    //       takeOrderSignature,
    //       cancelOrderSignature
    //     ]
    //   ]
    // );

    // // register assets
    // await Promise.all(
    //   config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
    //     console.log(`Registering ${assetSymbol}`);
    //     // await unlock(pricefeedUpdater, pricefeedUpdaterPassword);
    //     const tokenEntry = tokenInfo[environment][assetSymbol];
    //     await governanceAction(
    //       {from: authority, gas: 500000},
    //       deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
    //         tokenEntry.options.address,
    //         tokenEntry.name,
    //         assetSymbol,
    //         tokenEntry.decimals,
    //         tokenEntry.url,
    //         mockBytes,
    //         [mockAddress, mockAddress],
    //         [],
    //         []
    //       ]
    //     );
    //     console.log(`Registered ${assetSymbol}`);
    //   })
    // );

    // register assets (from updater)
    await Promise.all(
      config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        const tokenEntry = tokenInfo[environment][assetSymbol];
        await deployed.CanonicalPriceFeed.instance.registerAsset.postTransaction(
          {from: pricefeedUpdater, gas: 500000},
          [
            tokenEntry.options.address,
            tokenEntry.name,
            assetSymbol,
            tokenEntry.decimals,
            tokenEntry.url,
            mockBytes,
            [mockAddress, mockAddress],
            [],
            []
          ]
        );
        console.log(`Registered ${assetSymbol}`);
      })
    );

    // const blockchainTime = await getChainTime();
    // deployed.Competition = await deployContract(
    //   "competitions/Competition",
    //   opts,
    //   [
    //     mlnAddr, '0x0', '0x3c11e08E5f391872dAC90d43c4812a2AAE595E68', deployer,
    //     blockchainTime, blockchainTime + 8640000, 20 * 10 ** 18, 10 ** 24, 1000, false
    //   ]
    // );
  } else if (environment === "development") {
    console.log(`Deployer: ${accounts[0]}`);
    deployed.EthToken = await deployContract("dependencies/PreminedToken", opts);
    deployed.MlnToken = await deployContract("dependencies/PreminedToken", opts);
    deployed.EurToken = await deployContract("dependencies/PreminedToken", opts);
    deployed.TestingPriceFeed = await deployContract("prices/TestingPriceFeed", opts, [
      deployed.EthToken.options.address, 18
    ]);
    await deployed.TestingPriceFeed.methods.setDecimals(
      deployed.MlnToken.options.address, 18
    ).send(clone(opts));
    await deployed.TestingPriceFeed.methods.setDecimals(
      deployed.EurToken.options.address, 18
    ).send(clone(opts));
    deployed.MatchingMarket = await deployContract("exchanges/MatchingMarket", opts, [99999999999]);
    deployed.MatchingMarket = await deployContract("exchanges/MatchingMarket", opts, [99999999999]);
    await deployed.MatchingMarket.methods.setMatchingEnabled(false).send(clone(opts));
    deployed.MatchingMarket.methods.addTokenPairWhitelist(
      deployed.EthToken.options.address, deployed.MlnToken.options.address
    ).send(clone(opts));
    deployed.PriceTolerance = await deployContract('fund/risk-management/PriceTolerance', opts, [10])
    deployed.Whitelist = await deployContract('fund/compliance/Whitelist', opts, [[accounts[0]]])
    deployed.MatchingMarketAdapter = await deployContract("exchanges/MatchingMarketAdapter", opts);
    deployed.AccountingFactory = await deployContract("fund/accounting/AccountingFactory", opts);
    deployed.FeeManagerFactory = await deployContract("fund/fees/FeeManagerFactory", opts);
    deployed.ParticipationFactory = await deployContract("fund/participation/ParticipationFactory", opts);
    deployed.SharesFactory = await deployContract("fund/shares/SharesFactory", opts);
    deployed.TradingFactory = await deployContract("fund/trading/TradingFactory", opts);
    deployed.VaultFactory = await deployContract("fund/vault/VaultFactory", opts);
    deployed.PolicyManagerFactory = await deployContract("fund/policies/PolicyManagerFactory", opts);
    deployed.FundFactory = await deployContract("factory/FundFactory", opts, [
      deployed.AccountingFactory.options.address,
      deployed.FeeManagerFactory.options.address,
      deployed.ParticipationFactory.options.address,
      deployed.SharesFactory.options.address,
      deployed.TradingFactory.options.address,
      deployed.VaultFactory.options.address,
      deployed.PolicyManagerFactory.options.address
    ]);
  } else if (environment === "development-old") {
    [opts.from] = accounts;
    deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, 100000]);
    deployed.EthToken = await deployContract("assets/PreminedAsset", opts);
    deployed.MlnToken = await deployContract("assets/PreminedAsset", opts);
    deployed.EurToken = await deployContract("assets/PreminedAsset", opts);
    deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
      deployed.MlnToken.options.address,
      deployed.EthToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('ETH token'), 34),
      web3.utils.padLeft(web3.utils.toHex('ETH-T'), 34),
      18,
      'ethereum.org',
      mockBytes,
      [mockAddress, mockAddress],
      [],
      [],
      [
        config.protocol.pricefeed.interval,
        config.protocol.pricefeed.validity
      ],
      [
        config.protocol.staking.minimumAmount,
        config.protocol.staking.numOperators,
        config.protocol.staking.unstakeDelay
      ],
      deployed.Governance.options.address
    ]);
    deployed.StakingPriceFeed = await createStakingFeed({...opts}, deployed.CanonicalPriceFeed);
    await deployed.MlnToken.methods.approve(
      deployed.StakingPriceFeed.options.address,
      config.protocol.staking.minimumAmount
    ).send(
      {...opts}
    );
    await deployed.StakingPriceFeed.methods.depositStake(config.protocol.staking.minimumAmount, web3.utils.asciiToHex("")).send(
      {...opts}
    );

    deployed.SimpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", opts);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);
    deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [154630446100]);
    deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);

    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.CentralizedAdapter = await deployContract("exchange/adapter/CentralizedAdapter", opts);
    deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [accounts[0]]);
    deployed.Version = await deployContract(
      "version/Version",
      opts,
      [
        pkgInfo.version, deployed.Governance.options.address, deployed.MlnToken.options.address,
        deployed.EthToken.options.address, deployed.CanonicalPriceFeed.options.address, deployed.CompetitionCompliance.options.address
      ],
      () => {}, true
    );
    deployed.FundRanking = await deployContract("FundRanking", opts);
    const blockchainTime = await getChainTime();
    deployed.Competition = await deployContract(
      "competitions/Competition",
      opts,
      [
        deployed.MlnToken.options.address, deployed.Version.options.address,
        accounts[5], blockchainTime, blockchainTime + 8640000,
        20 * 10 ** 18, new BigNumber(10 ** 23), 10
      ]
    );
    await deployed.CompetitionCompliance.methods.changeCompetitionAddress(deployed.Competition.options.address).send(opts);
    await deployed.Competition.methods.batchAddToWhitelist(new BigNumber(10 ** 25), [accounts[0], accounts[1], accounts[2]]).send(opts);

    // whitelist trading pairs
    const pairsToWhitelist = [
      [deployed.MlnToken.options.address, deployed.EthToken.options.address],
      [deployed.EurToken.options.address, deployed.EthToken.options.address],
      [deployed.MlnToken.options.address, deployed.EurToken.options.address],
    ];
    await Promise.all(
      pairsToWhitelist.map(async (pair) => {
        await deployed.MatchingMarket.methods.addTokenPairWhitelist(pair[0], pair[1]).send(opts);
      })
    );

    // add Version to Governance tracking
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.options.address]);

    // whitelist exchange
    await governanceAction(
      opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
      [
        deployed.MatchingMarket.options.address,
        deployed.MatchingMarketAdapter.options.address,
        true,
        [
          makeOrderSignature,
          takeOrderSignature,
          cancelOrderSignature
        ]
      ]
    );

    // register assets
    await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
      deployed.MlnToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('Melon token'), 34),
      web3.utils.padLeft(web3.utils.toHex('MLN-T'), 34),
      18,
      "melonport.com",
      mockBytes,
      [mockAddress, mockAddress],
      [],
      []
    ]);
    await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
      deployed.EurToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('Euro token'), 34),
      web3.utils.padLeft(web3.utils.toHex('EUR-T'), 34),
      18,
      "europa.eu",
      mockBytes,
      [mockAddress, mockAddress],
      [],
      []
    ]);
  }
  // await verifyDeployment(deployed);
  return deployed;  // return instances of contracts we just deployed
}

// takes `deployed` object as defined above, and environment to write to
async function writeToAddressBook(deployedContracts, environment) {
  let addressBook;
  if (fs.existsSync(addressBookFile)) {
    addressBook = JSON.parse(fs.readFileSync(addressBookFile));
  } else addressBook = {};

  const namesToAddresses = {};
  Object.keys(deployedContracts)
    .forEach(key => {
      namesToAddresses[key] = deployedContracts[key].options.address
    });
  addressBook[environment] = namesToAddresses;

  fs.writeFileSync(
    addressBookFile,
    JSON.stringify(addressBook, null, '  '),
    'utf8'
  );
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify an environment using the environment variable CHAIN_ENV`);
  } else {
    deployEnvironment(environment)
      .then(deployedContracts => writeToAddressBook(deployedContracts, environment))
      .catch(err => console.error(err.stack))
      .finally(() => process.exit())
  }
}

export default deployEnvironment;
