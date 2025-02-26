// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IMerklCore interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMerklCore {
    function isGovernor(address _user) external view returns (bool isGovernor_);
}
