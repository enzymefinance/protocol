// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IFeeManager.sol";

/// @title Fee Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFee {
    function activateForFund(address) external;

    function addFundSettings(address, bytes calldata) external;

    function feeHook() external view returns (IFeeManager.FeeHook);

    function identifier() external pure returns (string memory);

    function payout(address) external returns (bool);

    function settle(address, bytes calldata)
        external
        returns (
            IFeeManager.SettlementType,
            address,
            uint256
        );
}
