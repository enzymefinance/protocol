// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";
import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";
import {IAaveV2Adapter} from "tests/interfaces/internal/IAaveV2Adapter.sol";
import {IAaveV2ATokenListOwner} from "tests/interfaces/internal/IAaveV2ATokenListOwner.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract AaveV2Utils is AddOnUtilsBase {
    function deployAaveV2ATokenListOwner(
        IAddressListRegistry _addressListRegistry,
        string memory _listDescription,
        address _lendingPoolAddressProvider
    ) internal returns (IAaveV2ATokenListOwner) {
        bytes memory args = abi.encode(_addressListRegistry, _listDescription, _lendingPoolAddressProvider);
        address addr = deployCode("AaveV2ATokenListOwner.sol", args);
        return IAaveV2ATokenListOwner(addr);
    }

    function getATokenAddress(address _underlying, address _lendingPool) internal view returns (address) {
        return IAaveV2LendingPool(_lendingPool).getReserveData(_underlying).aTokenAddress;
    }

    function registerUnderlyingsAndATokensForThem(
        IValueInterpreter _valueInterpreter,
        address _lendingPool,
        address[] memory _underlyings
    ) internal {
        for (uint256 i = 0; i < _underlyings.length; i++) {
            addPrimitiveWithTestAggregator({
                _valueInterpreter: _valueInterpreter,
                _tokenAddress: _underlyings[i],
                _skipIfRegistered: true
            });

            addPrimitiveWithTestAggregator({
                _valueInterpreter: _valueInterpreter,
                _tokenAddress: getATokenAddress({_underlying: _underlyings[i], _lendingPool: _lendingPool}),
                _skipIfRegistered: true
            });
        }
    }
}
