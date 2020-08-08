// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract MockChaiPriceSource {
    using SafeMath for uint256;

    uint256 public chi = 10 ** 27;
    uint256 public rho = now;

    function drip() external returns(uint256) {
        require(now >= rho, "drip: invalid now");

        rho = now;
        chi = chi.mul(99).div(100);
        return chi;
    }
}
