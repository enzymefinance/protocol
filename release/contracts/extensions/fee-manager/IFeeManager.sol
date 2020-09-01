// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../IExtension.sol";

/// @title FeeManager Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFeeManager is IExtension {
    enum FeeHook {None, BuyShares, Continuous}

    function settleFees(FeeHook, bytes calldata) external;
}
