// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IExternalPositionParser Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for all external position valitators
interface IExternalPositionParser {
    function parseAssetsForAction(uint256, bytes memory)
        external
        returns (
            address[] memory,
            uint256[] memory,
            address[] memory
        );

    function parseInitArgs(address, bytes memory) external returns (bytes memory);
}
