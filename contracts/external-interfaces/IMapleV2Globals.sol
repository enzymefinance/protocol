// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IMapleV2Globals Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMapleV2Globals {
    function isFactory(bytes32 _key, address _who) external view returns (bool isFactory_);
}
