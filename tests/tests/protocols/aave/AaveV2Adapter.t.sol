// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV2Adapter} from "tests/interfaces/internal/IAaveV2Adapter.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IAaveV2ATokenListOwner} from "tests/interfaces/internal/IAaveV2ATokenListOwner.sol";
import {AaveAdapterTest} from "./AaveAdapterTest.sol";
import {
    ETHEREUM_LENDING_POOL_ADDRESS,
    ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS
} from "./AaveV2Constants.sol";
import {AaveV2Utils} from "./AaveV2Utils.sol";

abstract contract AaveV2AdapterTest is AaveAdapterTest, AaveV2Utils {
    function setUp() public virtual override {
        (IAaveV2Adapter aaveV2Adapter,) = __deployATokenListOwnerAndAdapter({
            _addressListRegistry: core.persistent.addressListRegistry,
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(version),
            _lendingPool: lendingPool,
            _lendingPoolAddressProvider: lendingPoolAddressProvider
        });

        adapter = address(aaveV2Adapter);

        super.setUp();
    }

    // DEPLOYMENT HELPERS

    function __deployATokenListOwnerAndAdapter(
        IAddressListRegistry _addressListRegistry,
        address _integrationManagerAddress,
        address _lendingPool,
        address _lendingPoolAddressProvider
    ) internal returns (IAaveV2Adapter aaveV2Adapter_, IAaveV2ATokenListOwner aaveV2ATokenListOwner_) {
        uint256 aTokenListId = _addressListRegistry.getListCount();

        aaveV2ATokenListOwner_ = deployAaveV2ATokenListOwner({
            _addressListRegistry: _addressListRegistry,
            _listDescription: "",
            _lendingPoolAddressProvider: _lendingPoolAddressProvider
        });

        aaveV2Adapter_ = __deployAdapter({
            _integrationManagerAddress: _integrationManagerAddress,
            _addressListRegistry: _addressListRegistry,
            _aTokenListId: aTokenListId,
            _lendingPool: _lendingPool
        });

        return (aaveV2Adapter_, aaveV2ATokenListOwner_);
    }

    function __deployAdapter(
        IAddressListRegistry _addressListRegistry,
        address _integrationManagerAddress,
        uint256 _aTokenListId,
        address _lendingPool
    ) internal returns (IAaveV2Adapter) {
        bytes memory args = abi.encode(_integrationManagerAddress, _addressListRegistry, _aTokenListId, _lendingPool);
        address addr = deployCode("AaveV2Adapter.sol", args);
        return IAaveV2Adapter(addr);
    }

    // MISC HELPERS

    function __getATokenAddress(address _underlying) internal view override returns (address) {
        return getATokenAddress({_lendingPool: lendingPool, _underlying: _underlying});
    }
}

contract AaveV2AdapterTestEthereum is AaveV2AdapterTest {
    function setUp() public virtual override {
        lendingPool = ETHEREUM_LENDING_POOL_ADDRESS;
        lendingPoolAddressProvider = ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS;

        setUpMainnetEnvironment();

        regular18DecimalUnderlying = IERC20(ETHEREUM_WETH);
        non18DecimalUnderlying = IERC20(ETHEREUM_USDC);

        super.setUp();
    }
}

contract AaveV2AdapterTestPolygon is AaveV2AdapterTest {
    function setUp() public virtual override {
        lendingPool = POLYGON_LENDING_POOL_ADDRESS;
        lendingPoolAddressProvider = POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS;

        setUpPolygonEnvironment();

        regular18DecimalUnderlying = IERC20(POLYGON_WETH);
        non18DecimalUnderlying = IERC20(POLYGON_USDC);

        super.setUp();
    }
}

contract AaveV2AdapterTestEthereumV4 is AaveV2AdapterTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract AaveV2AdapterTestPolygonV4 is AaveV2AdapterTestPolygon {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}
