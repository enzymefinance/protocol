// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV2Adapter} from "tests/interfaces/internal/IAaveV2Adapter.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IAaveV2ATokenListOwner} from "tests/interfaces/internal/IAaveV2ATokenListOwner.sol";
import {AaveAdapterTestBase} from "./AaveAdapterTest.sol";
import {
    ETHEREUM_LENDING_POOL_ADDRESS,
    ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS,
    POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS
} from "./AaveV2Constants.sol";
import {AaveV2Utils} from "./AaveV2Utils.sol";

abstract contract AaveV2AdapterTest is AaveAdapterTestBase, AaveV2Utils {
    function __initializeAaveV2AdapterTest(
        EnzymeVersion _version,
        uint256 _chainId,
        address _lendingPool,
        address _lendingPoolAddressProvider,
        IERC20 _regular18DecimalUnderlying,
        IERC20 _non18DecimalUnderlying
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        (IAaveV2Adapter aaveV2Adapter,) = __deployATokenListOwnerAndAdapter({
            _addressListRegistry: core.persistent.addressListRegistry,
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(_version),
            _lendingPool: _lendingPool,
            _lendingPoolAddressProvider: _lendingPoolAddressProvider
        });

        __initializeAaveAdapterTestBase({
            _version: _version,
            _adapterAddress: address(aaveV2Adapter),
            _lendingPool: _lendingPool,
            _lendingPoolAddressProvider: _lendingPoolAddressProvider,
            _regular18DecimalUnderlying: _regular18DecimalUnderlying,
            _non18DecimalUnderlying: _non18DecimalUnderlying
        });
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
        return getATokenAddress({_lendingPool: __getLendingPool(), _underlying: _underlying});
    }
}

abstract contract AaveV2AdapterTestEthereumBase is AaveV2AdapterTest {
    function __initialize(EnzymeVersion _version) internal {
        __initializeAaveV2AdapterTest({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _lendingPool: ETHEREUM_LENDING_POOL_ADDRESS,
            _lendingPoolAddressProvider: ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
            _regular18DecimalUnderlying: IERC20(ETHEREUM_WETH),
            _non18DecimalUnderlying: IERC20(ETHEREUM_USDC)
        });
    }
}

abstract contract AaveV2AdapterTestPolygonBase is AaveV2AdapterTest {
    function __initialize(EnzymeVersion _version) internal {
        __initializeAaveV2AdapterTest({
            _version: _version,
            _chainId: POLYGON_CHAIN_ID,
            _lendingPool: POLYGON_LENDING_POOL_ADDRESS,
            _lendingPoolAddressProvider: POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
            _regular18DecimalUnderlying: IERC20(POLYGON_WETH),
            _non18DecimalUnderlying: IERC20(POLYGON_USDC)
        });
    }
}

contract AaveV2AdapterTestEthereum is AaveV2AdapterTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract AaveV2AdapterTestEthereumV4 is AaveV2AdapterTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract AaveV2AdapterTestPolygon is AaveV2AdapterTestPolygonBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract AaveV2AdapterTestPolygonV4 is AaveV2AdapterTestPolygonBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}
