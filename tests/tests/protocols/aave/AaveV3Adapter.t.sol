// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV3Adapter} from "tests/interfaces/internal/IAaveV3Adapter.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IAaveV3ATokenListOwner} from "tests/interfaces/internal/IAaveV3ATokenListOwner.sol";
import {AaveAdapterTest} from "./AaveAdapterTest.sol";
import {AaveV3Utils} from "./AaveV3Utils.sol";
import {
    ETHEREUM_POOL_ADDRESS,
    ETHEREUM_POOL_ADDRESS_PROVIDER,
    POLYGON_POOL_ADDRESS,
    POLYGON_POOL_ADDRESS_PROVIDER
} from "./AaveV3Constants.sol";

abstract contract AaveV3AdapterTest is AaveAdapterTest, AaveV3Utils {
    function setUp() public virtual override {
        (IAaveV3Adapter aaveV2Adapter,) = __deployATokenListOwnerAndAdapter({
            _addressListRegistry: core.persistent.addressListRegistry,
            _integrationManager: core.release.integrationManager,
            _lendingPool: lendingPool,
            _lendingPoolAddressProvider: lendingPoolAddressProvider
        });

        adapter = address(aaveV2Adapter);

        super.setUp();
    }

    // DEPLOYMENT HELPERS

    function __deployATokenListOwnerAndAdapter(
        IAddressListRegistry _addressListRegistry,
        IIntegrationManager _integrationManager,
        address _lendingPool,
        address _lendingPoolAddressProvider
    ) internal returns (IAaveV3Adapter aaveV3Adapter_, IAaveV3ATokenListOwner aaveV3ATokenListOwner_) {
        uint256 aTokenListId;
        (aaveV3ATokenListOwner_, aTokenListId) = deployAaveV3ATokenListOwner({
            _addressListRegistry: _addressListRegistry,
            _lendingPoolAddressProvider: _lendingPoolAddressProvider
        });

        aaveV3Adapter_ = __deployAdapter({
            _integrationManager: _integrationManager,
            _addressListRegistry: _addressListRegistry,
            _aTokenListId: aTokenListId,
            _lendingPool: _lendingPool
        });

        return (aaveV3Adapter_, aaveV3ATokenListOwner_);
    }

    function __deployAdapter(
        IIntegrationManager _integrationManager,
        IAddressListRegistry _addressListRegistry,
        uint256 _aTokenListId,
        address _lendingPool
    ) internal returns (IAaveV3Adapter) {
        uint16 referralCode = 0;
        bytes memory args =
            abi.encode(_integrationManager, _addressListRegistry, _aTokenListId, _lendingPool, referralCode);
        address addr = deployCode("AaveV3Adapter.sol", args);
        return IAaveV3Adapter(addr);
    }

    // MISC HELPERS

    function __getATokenAddress(address _underlying) internal view override returns (address) {
        return getATokenAddress({_lendingPool: lendingPool, _underlying: _underlying});
    }

    function __registerTokensAndATokensForThem(address[] memory _underlyingAddresses) internal {
        registerUnderlyingsAndATokensForThem({
            _valueInterpreter: core.release.valueInterpreter,
            _underlyings: _underlyingAddresses,
            _lendingPool: lendingPool
        });
    }
}

contract AaveV3AdapterTestEthereum is AaveV3AdapterTest {
    function setUp() public override {
        lendingPool = ETHEREUM_POOL_ADDRESS;
        lendingPoolAddressProvider = ETHEREUM_POOL_ADDRESS_PROVIDER;

        setUpMainnetEnvironment();

        regular18DecimalUnderlying = IERC20(ETHEREUM_WETH);
        non18DecimalUnderlying = IERC20(ETHEREUM_USDC);

        __registerTokensAndATokensForThem(toArray(address(regular18DecimalUnderlying), address(non18DecimalUnderlying)));

        super.setUp();
    }
}

contract AaveV3AdapterTestPolygon is AaveV3AdapterTest {
    function setUp() public override {
        lendingPool = POLYGON_POOL_ADDRESS;
        lendingPoolAddressProvider = POLYGON_POOL_ADDRESS_PROVIDER;

        setUpPolygonEnvironment();

        regular18DecimalUnderlying = IERC20(POLYGON_WETH);
        non18DecimalUnderlying = IERC20(POLYGON_USDC);

        __registerTokensAndATokensForThem(toArray(address(regular18DecimalUnderlying), address(non18DecimalUnderlying)));

        super.setUp();
    }
}
