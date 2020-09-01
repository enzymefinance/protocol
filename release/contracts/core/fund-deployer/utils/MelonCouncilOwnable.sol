// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IMelonCouncilOwnable.sol";

/// @title MelonCouncilOwnable Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A base contract that ensures Melon Council control after setup
abstract contract MelonCouncilOwnable is IMelonCouncilOwnable, Ownable {
    address internal immutable MTC;

    constructor(address _mtc) public {
        MTC = _mtc;
    }

    /// @notice Renounces ownership of the contract (NOT ALLOWED)
    /// @dev Ownership cannot be destroyed
    function renounceOwnership() public override {
        revert("renounceOwnership: Renouncing ownership not allowed");
    }

    /// @notice Transfers ownership of the contract
    /// @param _newOwner The new contract owner
    /// @dev Ownership is only transferrable until the MTC receives ownership.
    /// After that, ownership is no longer transferrable. This is desirable so
    /// that Melon developers can do the time-consuming work of deploying and
    /// configuring a contract, before giving custody of it to the Melon Council
    // TODO: is onlyOwner duplicated on the `super.` call?
    function transferOwnership(address _newOwner) public override onlyOwner {
        require(MTC != owner(), "transferOwnership: MTC cannot transfer ownership");
        super.transferOwnership(_newOwner);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @dev Redundant getter, but conforms to our getter syntax
    function getOwner() external override view returns (address) {
        return owner();
    }

    function getMTC() external view returns (address) {
        return MTC;
    }
}
