// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IERC4626} from "./IERC4626.sol";
import {IMapleV2PoolManager} from "./IMapleV2PoolManager.sol";

interface IMapleV2Pool is IERC4626 {
    function asset() external view returns (address underlying_);

    function convertToExitAssets(uint256 _shares) external view returns (uint256 assets_);

    function manager() external view returns (IMapleV2PoolManager manager_);

    function maxDeposit(address _receiver) external view returns (uint256 maxAssets_);

    function maxRedeem(address _owner) external view returns (uint256 maxShares_);
}
