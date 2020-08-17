// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IFeeManager.sol";

/// @title Fee Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFee {
    function addFundSettings(bytes calldata) external;

    function feeHook() external view returns (IFeeManager.FeeHook);

    function identifier() external pure returns (string memory);

    function payoutSharesOutstanding()
        external
        returns (
            address,
            address,
            uint256
        );

    function settle(bytes calldata)
        external
        returns (
            address,
            address,
            uint256
        );
}
