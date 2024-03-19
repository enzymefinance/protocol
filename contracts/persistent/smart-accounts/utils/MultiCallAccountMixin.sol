// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {GSNRecipientMixin} from "../../../utils/0.8.19/gas-station-network/GSNRecipientMixin.sol";
import {IMultiCallAccountMixin} from "./interfaces/IMultiCallAccountMixin.sol";

/// @title MultiCallAccountMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A basic smart account that allows its owner to execute multiple calls atomically
/// @dev Owner must be set via by inheriting contracts via __setOwner()
abstract contract MultiCallAccountMixin is IMultiCallAccountMixin, GSNRecipientMixin {
    event OwnerSet(address nextOwner);

    error Unauthorized();

    address private owner;

    constructor(address _addressListRegistry, uint256 _gsnTrustedForwardersAddressListId)
        GSNRecipientMixin(_addressListRegistry, _gsnTrustedForwardersAddressListId)
    {}

    /// @notice Execute multiple external calls
    /// @param _calls The calls to execute
    /// @dev This doesn't need to be payable for Enzyme purposes
    function executeCalls(Call[] calldata _calls) public virtual override {
        if (__msgSender() != getOwner()) {
            revert Unauthorized();
        }

        uint256 callsLength = _calls.length;
        for (uint256 i; i < callsLength; i++) {
            Call memory call = _calls[i];

            Address.functionCall({target: call.target, data: call.data});
        }
    }

    /// @notice Gets the owner
    /// @return owner_ The owner
    function getOwner() public view returns (address owner_) {
        return owner;
    }

    /// @dev Helper to set the owner
    function __setOwner(address _nextOwner) internal {
        owner = _nextOwner;

        emit OwnerSet(_nextOwner);
    }
}
