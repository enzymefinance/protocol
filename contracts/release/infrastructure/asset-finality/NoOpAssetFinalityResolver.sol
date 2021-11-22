// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./IAssetFinalityResolver.sol";

/// @title NoOpAssetFinalityResolver Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract that helps achieve asset finality
contract NoOpAssetFinalityResolver is IAssetFinalityResolver {
    function finalizeAssets(address _target, address[] memory _assets) external override {}
}
