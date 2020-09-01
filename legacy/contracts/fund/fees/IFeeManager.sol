// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

/// @title FeeManager Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFeeManager {
    enum FeeHook {None, BuyShares, Continuous}

    function enableFees(address[] calldata, bytes[] calldata) external;

    function settleFees(FeeHook, bytes calldata) external;
}

/// @title FeeManagerFactory Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFeeManagerFactory {
    function createInstance(address) external returns (address);
}
