// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAaveV3Pool} from "tests/interfaces/external/IAaveV3Pool.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IAaveV3ATokenListOwner} from "tests/interfaces/internal/IAaveV3ATokenListOwner.sol";
import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

// Ethereum
address constant ETHEREUM_POOL_ADDRESS_PROVIDER = 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e;
address constant ETHEREUM_PROTOCOL_DATA_PROVIDER = 0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3;

// Polygon
address constant POLYGON_POOL_ADDRESS_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
address constant POLYGON_PROTOCOL_DATA_PROVIDER = 0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654;

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
        returns (address aTokenAddress_)
    {
        return _lendingPool.getReserveData(_underlying).aTokenAddress;
    }
}
