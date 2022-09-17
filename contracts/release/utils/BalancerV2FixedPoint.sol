// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.6.12;

// Verbatim code, adapted to our style guide for variable naming only, see:
// https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/solidity-utils/contracts/math/FixedPoint.sol
library BalancerV2FixedPoint {
    uint256 internal constant ONE = 1e18; // 18 decimal places

    function divUp(uint256 _a, uint256 _b) internal pure returns (uint256 res_) {
        require(_b != 0, "zero division");

        if (_a == 0) {
            return 0;
        } else {
            uint256 aInflated = _a * ONE;
            require(aInflated / _a == ONE, "div internal"); // mul overflow

            // The traditional divUp formula is:
            // divUp(x, y) := (x + y - 1) / y
            // To avoid intermediate overflow in the addition, we distribute the division and get:
            // divUp(x, y) := (x - 1) / y + 1
            // Note that this requires x != 0, which we already tested for.

            return ((aInflated - 1) / _b) + 1;
        }
    }

    function mulUp(uint256 _a, uint256 _b) internal pure returns (uint256 res_) {
        uint256 product = _a * _b;
        require(_a == 0 || product / _a == _b, "mul overflow");

        if (product == 0) {
            return 0;
        } else {
            // The traditional divUp formula is:
            // divUp(x, y) := (x + y - 1) / y
            // To avoid intermediate overflow in the addition, we distribute the division and get:
            // divUp(x, y) := (x - 1) / y + 1
            // Note that this requires x != 0, which we already tested for.

            return ((product - 1) / ONE) + 1;
        }
    }
}
