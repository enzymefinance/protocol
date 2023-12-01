// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1Controller Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1Controller {
    function isTermDeployed(address _contractAddress) external view returns (bool isDeployed_);
}
