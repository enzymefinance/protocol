// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../external-interfaces/ICompoundV3Configurator.sol";
import "./utils/AddOnlyAddressListOwnerBase.sol";

/// @title CompoundV3CTokenListOwner Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The AddressListRegistry owner of a Compound v3 cToken list
contract CompoundV3CTokenListOwner is AddOnlyAddressListOwnerBase {
    ICompoundV3Configurator private immutable CONFIGURATOR_CONTRACT;

    constructor(address _addressListRegistry, string memory _listDescription, address _compoundV3Configurator)
        public
        AddOnlyAddressListOwnerBase(_addressListRegistry, _listDescription)
    {
        CONFIGURATOR_CONTRACT = ICompoundV3Configurator(_compoundV3Configurator);
    }

    /// @dev Required virtual helper to validate items prior to adding them to the list
    function __validateItems(address[] calldata _items) internal override {
        for (uint256 i; i < _items.length; i++) {
            require(
                CONFIGURATOR_CONTRACT.getConfiguration(_items[i]).baseToken != address(0),
                "__validateItems: Invalid cToken"
            );
        }
    }
}
