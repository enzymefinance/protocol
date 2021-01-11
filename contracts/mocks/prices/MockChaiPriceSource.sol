// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract MockChaiPriceSource {
    using SafeMath for uint256;

    uint256 private chiStored = 10**27;
    uint256 private rhoStored = now;

    function drip() external returns (uint256) {
        require(now >= rhoStored, "drip: invalid now");
        rhoStored = now;
        chiStored = chiStored.mul(99).div(100);
        return chi();
    }

    ////////////////////
    // STATE GETTERS //
    ///////////////////

    function chi() public view returns (uint256) {
        return chiStored;
    }

    function rho() public view returns (uint256) {
        return rhoStored;
    }
}
