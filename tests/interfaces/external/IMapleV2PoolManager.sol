// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IMapleV2Pool} from "./IMapleV2Pool.sol";
import {IMapleV2ProxyFactory} from "./IMapleV2ProxyFactory.sol";
import {IMapleV2WithdrawalManager} from "./IMapleV2WithdrawalManager.sol";

interface IMapleV2PoolManager {
    function factory() external view returns (IMapleV2ProxyFactory factory_);

    function pool() external view returns (IMapleV2Pool pool_);

    function withdrawalManager() external view returns (IMapleV2WithdrawalManager withdrawalManager_);
}
