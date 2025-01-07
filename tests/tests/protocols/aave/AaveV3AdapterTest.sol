// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveV3Adapter} from "tests/interfaces/internal/IAaveV3Adapter.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IAaveV3ATokenListOwner} from "tests/interfaces/internal/IAaveV3ATokenListOwner.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {AaveAdapterTestBase} from "./AaveAdapterTest.sol";
import {AaveV3Utils} from "./AaveV3Utils.sol";

abstract contract AaveV3AdapterTest is AaveAdapterTestBase, AaveV3Utils {
    function __initializeAaveV3AdapterTest(
        EnzymeVersion _version,
        uint256 _chainId,
        address _lendingPool,
        address _lendingPoolAddressProvider,
        IERC20 _regular18DecimalUnderlying,
        IERC20 _non18DecimalUnderlying
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        (IAaveV3Adapter aaveV3Adapter,) = __deployATokenListOwnerAndAdapter({
            _addressListRegistry: core.persistent.addressListRegistry,
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(_version),
            _lendingPool: _lendingPool,
            _lendingPoolAddressProvider: _lendingPoolAddressProvider
        });

        __initializeAaveAdapterTestBase({
            _version: _version,
            _adapterAddress: address(aaveV3Adapter),
            _lendingPool: _lendingPool,
            _lendingPoolAddressProvider: _lendingPoolAddressProvider,
            _regular18DecimalUnderlying: _regular18DecimalUnderlying,
            _non18DecimalUnderlying: _non18DecimalUnderlying
        });

        __registerTokensAndATokensForThem({
            _version: _version,
            _underlyingAddresses: toArray(address(_regular18DecimalUnderlying), address(_non18DecimalUnderlying))
        });
    }

    // DEPLOYMENT HELPERS

    function __deployATokenListOwnerAndAdapter(
        IAddressListRegistry _addressListRegistry,
        address _integrationManagerAddress,
        address _lendingPool,
        address _lendingPoolAddressProvider
    ) internal returns (IAaveV3Adapter aaveV3Adapter_, IAaveV3ATokenListOwner aaveV3ATokenListOwner_) {
        uint256 aTokenListId;
        (aaveV3ATokenListOwner_, aTokenListId) = deployAaveV3ATokenListOwner({
            _addressListRegistry: _addressListRegistry,
            _lendingPoolAddressProvider: _lendingPoolAddressProvider
        });

        aaveV3Adapter_ = __deployAdapter({
            _integrationManagerAddress: _integrationManagerAddress,
            _addressListRegistry: _addressListRegistry,
            _aTokenListId: aTokenListId,
            _lendingPool: _lendingPool
        });

        return (aaveV3Adapter_, aaveV3ATokenListOwner_);
    }

    function __deployAdapter(
        address _integrationManagerAddress,
        IAddressListRegistry _addressListRegistry,
        uint256 _aTokenListId,
        address _lendingPool
    ) internal returns (IAaveV3Adapter) {
        uint16 referralCode = 0;
        bytes memory args =
            abi.encode(_integrationManagerAddress, _addressListRegistry, _aTokenListId, _lendingPool, referralCode);
        address addr = deployCode("AaveV3Adapter.sol", args);
        return IAaveV3Adapter(addr);
    }

    // MISC HELPERS

    function __getATokenAddress(address _underlying) internal view override returns (address) {
        return getATokenAddress({_lendingPool: __getLendingPool(), _underlying: _underlying});
    }

    function __registerTokensAndATokensForThem(EnzymeVersion _version, address[] memory _underlyingAddresses)
        internal
    {
        registerUnderlyingsAndATokensForThem({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(_version)),
            _underlyings: _underlyingAddresses,
            _lendingPool: __getLendingPool()
        });
    }
}
