// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IFeeManager.sol";

/// @title Fee Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interface for all fees
interface IFee {
    function activateForFund(address, address) external;

    function addFundSettings(address, bytes calldata) external;

    function identifier() external pure returns (string memory);

    function implementedHooks()
        external
        view
        returns (
            IFeeManager.FeeHook[] memory,
            IFeeManager.FeeHook[] memory,
            bool,
            bool
        );

    function payout(address, address) external returns (bool);

    function settle(
        address,
        address,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256
    )
        external
        returns (
            IFeeManager.SettlementType,
            address,
            uint256
        );

    function update(
        address,
        address,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256
    ) external;
}
