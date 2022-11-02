// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../release/interfaces/IAaveAToken.sol";
import "../../../release/interfaces/IAaveV2LendingPool.sol";
import "../../../release/interfaces/IAaveV2LendingPoolAddressProvider.sol";
import "./utils/AddOnlyAddressListOwnerBase.sol";

/// @title AaveV2ATokenListOwner Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The AddressListRegistry owner of an Aave v2 aToken list
contract AaveV2ATokenListOwner is AddOnlyAddressListOwnerBase {
    IAaveV2LendingPoolAddressProvider private immutable LENDING_POOL_ADDRESS_PROVIDER_CONTRACT;

    constructor(
        address _addressListRegistry,
        string memory _listDescription,
        address _lendingPoolAddressProvider
    ) public AddOnlyAddressListOwnerBase(_addressListRegistry, _listDescription) {
        LENDING_POOL_ADDRESS_PROVIDER_CONTRACT = IAaveV2LendingPoolAddressProvider(
            _lendingPoolAddressProvider
        );
    }

    /// @dev Required virtual helper to validate items prior to adding them to the list
    function __validateItems(address[] calldata _items) internal override {
        IAaveV2LendingPool lendingPoolContract = IAaveV2LendingPool(
            LENDING_POOL_ADDRESS_PROVIDER_CONTRACT.getLendingPool()
        );

        for (uint256 i; i < _items.length; i++) {
            address aToken = _items[i];
            address underlying = IAaveAToken(aToken).UNDERLYING_ASSET_ADDRESS();

            require(
                aToken == lendingPoolContract.getReserveData(underlying).aTokenAddress,
                "__validateItems: Invalid aToken"
            );
        }
    }
}
