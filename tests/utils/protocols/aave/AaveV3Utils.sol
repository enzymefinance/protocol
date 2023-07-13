// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAaveV3Pool} from "tests/interfaces/external/IAaveV3Pool.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IAaveV3ATokenListOwner} from "tests/interfaces/internal/IAaveV3ATokenListOwner.sol";
import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

abstract contract AaveV3Utils is AddOnUtilsBase {
    function deployAaveV3ATokenListOwner(IAddressListRegistry _addressListRegistry, address _lendingPoolAddressProvider)
        internal
        returns (IAaveV3ATokenListOwner aTokenListOwner_, uint256 aTokenListId_)
    {
        uint256 aTokenListId = _addressListRegistry.getListCount();

        string memory listDescription = "";
        bytes memory args = abi.encode(_addressListRegistry, listDescription, _lendingPoolAddressProvider);
        address addr = deployCode("AaveV3ATokenListOwner.sol", args);
        return (IAaveV3ATokenListOwner(addr), aTokenListId);
    }

    function getATokenAddress(address _underlying, IAaveV3Pool _lendingPool)
        internal
        view
        returns (address aTokenAddress_)
    {
        return _lendingPool.getReserveData(_underlying).aTokenAddress;
    }
}
