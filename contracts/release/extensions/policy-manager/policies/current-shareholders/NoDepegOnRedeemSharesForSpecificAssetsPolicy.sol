// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IValueInterpreter} from "../../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import {IPolicyManager} from "../../IPolicyManager.sol";
import {NoDepegPolicyBase} from "../utils/0.8.19/NoDepegPolicyBase.sol";

/// @title NoDepegOnRedeemSharesForSpecificAssetsPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that disallows specific-asset redemptions when the price of one of a list of stable assets
/// deviates significantly from its expected peg
contract NoDepegOnRedeemSharesForSpecificAssetsPolicy is NoDepegPolicyBase {
    constructor(address _policyManagerAddress, IValueInterpreter _valueInterpreter)
        NoDepegPolicyBase(_policyManagerAddress, _valueInterpreter)
    {}

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "NO_DEPEG_ON_REDEEM_SHARES_FOR_SPECIFIC_ASSETS";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.RedeemSharesForSpecificAssets;

        return implementedHooks_;
    }
}
