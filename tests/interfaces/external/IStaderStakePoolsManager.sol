// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IStaderStakePoolsManager as IStaderStakePoolsManagerProd} from
    "contracts/external-interfaces/IStaderStakePoolsManager.sol";

/// @title IStaderStakePoolsManager Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IStaderStakePoolsManager is IStaderStakePoolsManagerProd {
    function previewDeposit(uint256 _assets) external payable returns (uint256 shares_);
}
