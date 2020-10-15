// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IFeeManager.sol";

/// @title Fee Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFee {
    function activateForFund(address) external;

    function addFundSettings(address, bytes calldata) external;

    function identifier() external pure returns (string memory);

    function payout(address) external returns (bool);

    function settle(
        address,
        IFeeManager.FeeHook,
        bytes calldata
    )
        external
        returns (
            IFeeManager.SettlementType,
            address,
            uint256
        );

    function settlesOnHook(IFeeManager.FeeHook) external pure returns (bool);
}
