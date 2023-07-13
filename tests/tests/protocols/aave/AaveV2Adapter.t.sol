// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {
    ETHEREUM_LENDING_POOL_ADDRESS,
    ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS
} from "tests/utils/protocols/aave/AaveV2Constants.sol";
import {AaveV2Utils} from "tests/utils/protocols/aave/AaveV2Utils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV2Adapter} from "tests/interfaces/internal/IAaveV2Adapter.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

abstract contract AaveV2AdapterTest is IntegrationTest, AaveV2Utils {
    address internal vaultOwner = makeAddr("VaultOwner");
    address internal sharesBuyer = makeAddr("SharesBuyer");

    IVault internal vaultProxy;
    IComptroller internal comptrollerProxy;
    address internal externalPositionProxy;
    address internal aWeth;

    IAaveV2Adapter internal aaveV2Adapter;
    address internal lendingPool;
    address internal lendingPoolAddressProvider;

    function setUpAave() internal {
        (aaveV2Adapter,) = deployAaveV2ATokenListOwnerAndAdapter({
            _addressListRegistry: core.persistent.addressListRegistry,
            _integrationManager: core.release.integrationManager,
            _lendingPool: lendingPool,
            _lendingPoolAddressProvider: lendingPoolAddressProvider
        });

        aWeth = getATokenAddress({_token: address(wethToken), _lendingPool: lendingPool});
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: aWeth,
            _skipIfRegistered: true
        });

        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: vaultOwner,
            _sharesBuyer: sharesBuyer,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 1000 ether
        });
    }

    function testLend() public {
        uint256 amountToLend = 1 ether;
        bytes memory integrationData = abi.encode(aWeth, amountToLend);
        bytes memory callArgs = abi.encode(address(aaveV2Adapter), IAaveV2Adapter.lend.selector, integrationData);

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: callArgs
        });

        assertEq(IERC20(aWeth).balanceOf(address(vaultProxy)), amountToLend);
    }
}

contract AaveV2AdapterTestEthereum is AaveV2AdapterTest {
    function setUp() public override {
        lendingPool = ETHEREUM_LENDING_POOL_ADDRESS;
        lendingPoolAddressProvider = ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS;

        setUpMainnetEnvironment();
        setUpAave();
    }
}

contract AaveV2AdapterTestPolygon is AaveV2AdapterTest {
    function setUp() public override {
        lendingPool = POLYGON_LENDING_POOL_ADDRESS;
        lendingPoolAddressProvider = POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS;

        setUpPolygonEnvironment();
        setUpAave();
    }
}
