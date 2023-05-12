// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";
import {IAaveV2Adapter} from "tests/interfaces/internal/IAaveV2Adapter.sol";
import {IAaveV2ATokenListOwner} from "tests/interfaces/internal/IAaveV2ATokenListOwner.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";

// Ethereum
address constant LENDING_POOL_ADDRESS_ETHEREUM = 0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9;
address constant LENDING_POOL_ADDRESS_PROVIDER_ADDRESS_ETHEREUM = 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5;

// Polygon
address constant LENDING_POOL_ADDRESS_POLYGON = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;
address constant LENDING_POOL_ADDRESS_PROVIDER_ADDRESS_POLYGON = 0xd05e3E715d945B59290df0ae8eF85c1BdB684744;

abstract contract AaveV2Utils is Test {
    function deployAaveV2ATokenListOwnerAndAdapter(
        IAddressListRegistry _addressListRegistry,
        IIntegrationManager _integrationManager,
        address _lendingPool,
        address _lendingPoolAddressProvider
    ) public returns (IAaveV2Adapter aaveV2Adapter_, IAaveV2ATokenListOwner aaveV2ATokenListOwner_) {
        uint256 aTokenListId = _addressListRegistry.getListCount();

        aaveV2ATokenListOwner_ = deployAaveV2ATokenListOwner({
            _addressListRegistry: _addressListRegistry,
            _listDescription: "",
            _lendingPoolAddressProvider: _lendingPoolAddressProvider
        });

        aaveV2Adapter_ = deployAaveV2Adapter({
            _integrationManager: _integrationManager,
            _addressListRegistry: _addressListRegistry,
            _aTokenListId: aTokenListId,
            _lendingPool: _lendingPool
        });

        return (aaveV2Adapter_, aaveV2ATokenListOwner_);
    }

    function deployAaveV2Adapter(
        IIntegrationManager _integrationManager,
        IAddressListRegistry _addressListRegistry,
        uint256 _aTokenListId,
        address _lendingPool
    ) public returns (IAaveV2Adapter) {
        bytes memory args = abi.encode(_integrationManager, _addressListRegistry, _aTokenListId, _lendingPool);
        address addr = deployCode("AaveV2Adapter.sol", args);
        return IAaveV2Adapter(addr);
    }

    function deployAaveV2ATokenListOwner(
        IAddressListRegistry _addressListRegistry,
        string memory _listDescription,
        address _lendingPoolAddressProvider
    ) public returns (IAaveV2ATokenListOwner) {
        bytes memory args = abi.encode(_addressListRegistry, _listDescription, _lendingPoolAddressProvider);
        address addr = deployCode("AaveV2ATokenListOwner.sol", args);
        return IAaveV2ATokenListOwner(addr);
    }

    function getATokenAddress(address _token, address _lendingPool) internal returns (address) {
        return IAaveV2LendingPool(_lendingPool).getReserveData(_token).aTokenAddress;
    }
}
