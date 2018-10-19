import * as tokenInfo from "../info/tokenInfo";
import * as config from "../config/environment";

const assert = require('assert');

async function verifyDeployment(deployed) {
  // check version's governance address is correct
  const environment = "live";
  const governanceFromVersion = await deployed.Version.instance.GOVERNANCE.call();
  assert.deepEqual(deployed.Governance.address, governanceFromVersion);

  // check governance registered version
  const versionsLength = await deployed.Governance.instance.getVersionsLength.call();
  const latestRegisteredVersion = await deployed.Governance.instance.versions.call({}, [versionsLength - 1]);
  assert.deepEqual(deployed.Version.address, latestRegisteredVersion[0]);

  // check native asset of the deployed versionNumber
  const nativeAsset = await deployed.Version.instance.getNativeAsset.call();
  const [weth] = tokenInfo[environment].filter(entry => entry.symbol === "W-ETH");
  assert.deepEqual(nativeAsset, weth.address);

  // check pricefeed registered assets
  const assetsToRegister = config[environment].protocol.pricefeed.assetsToRegister;
  /* eslint-disable no-restricted-syntax */
  for (const assetSymbol of assetsToRegister) {
    const [tokenEntry] = tokenInfo[environment].filter(entry => entry.symbol === assetSymbol);
    /* eslint-disable no-await-in-loop */
    const assetInfo = await deployed.PriceFeed.instance.information.call({}, [tokenEntry.address]);
    assert.deepEqual(assetInfo[4], true); // TODO: actually check that there is info returned
  }
}

export default verifyDeployment;
