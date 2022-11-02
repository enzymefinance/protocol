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
import "../../../release/interfaces/IAaveV3Pool.sol";
import "../../../release/interfaces/IAaveV3PoolAddressProvider.sol";
import "./utils/AddOnlyAddressListOwnerBase.sol";

/// @title AaveV3ATokenListOwner Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The AddressListRegistry owner of an Aave v3 aToken list
contract AaveV3ATokenListOwner is AddOnlyAddressListOwnerBase {
    IAaveV3PoolAddressProvider private immutable POOL_ADDRESS_PROVIDER_CONTRACT;

    constructor(
        address _addressListRegistry,
        string memory _listDescription,
        address _poolAddressProvider
    ) public AddOnlyAddressListOwnerBase(_addressListRegistry, _listDescription) {
        POOL_ADDRESS_PROVIDER_CONTRACT = IAaveV3PoolAddressProvider(_poolAddressProvider);
    }

    /// @dev Required virtual helper to validate items prior to adding them to the list
    function __validateItems(address[] calldata _items) internal override {
        IAaveV3Pool poolContract = IAaveV3Pool(POOL_ADDRESS_PROVIDER_CONTRACT.getPool());

        for (uint256 i; i < _items.length; i++) {
            address aToken = _items[i];

            require(
                aToken ==
                    poolContract
                        .getReserveData(IAaveAToken(aToken).UNDERLYING_ASSET_ADDRESS())
                        .aTokenAddress,
                "__validateItems: Invalid aToken"
            );
        }
    }
}
