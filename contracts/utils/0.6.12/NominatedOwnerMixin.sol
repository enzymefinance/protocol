// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title NominatedOwnerMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for a nominated contract ownership transfer pattern
/// @dev Initial owner must be set in inheriting contract via __setOwner()
abstract contract NominatedOwnerMixin {
    event NominatedOwnerSet(address indexed nominatedOwner);

    event OwnerSet(address owner);

    address private nominatedOwner;
    address private owner;

    modifier onlyOwner() {
        require(msg.sender == getOwner(), "onlyOwner: Unauthorized");
        _;
    }

    /// @notice Claim ownership of the contract
    /// @dev Note that this claims process means that `owner` can never be reset to address(0)
    function claimOwnership() external {
        address nextOwner = getNominatedOwner();
        require(msg.sender == nextOwner, "claimOwnership: Unauthorized");

        __setOwner(nextOwner);

        delete nominatedOwner;
    }

    /// @notice Nominate a new contract owner
    /// @param _nextNominatedOwner The account to nominate
    function setNominatedOwner(address _nextNominatedOwner) external onlyOwner {
        __setNominatedOwner(_nextNominatedOwner);
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to set the nominated owner
    function __setNominatedOwner(address _nextNominatedOwner) internal {
        nominatedOwner = _nextNominatedOwner;

        emit NominatedOwnerSet(_nextNominatedOwner);
    }

    /// @dev Helper to set the next owner.
    /// Should only be invoked once by inheriting contract to set initial ownership.
    /// Does not protect against address(0) on unclaimable address.
    function __setOwner(address _nextOwner) internal {
        owner = _nextOwner;

        emit OwnerSet(_nextOwner);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the account that is nominated to be the next contract owner
    /// @return nominatedOwner_ The next contract owner nominee
    function getNominatedOwner() public view returns (address nominatedOwner_) {
        return nominatedOwner;
    }

    /// @notice Gets the owner of this contract
    /// @return owner_ The contract owner
    function getOwner() public view returns (address owner_) {
        return owner;
    }
}
