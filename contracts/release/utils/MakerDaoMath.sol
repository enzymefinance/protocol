// SPDX-License-Identifier: AGPL-3.0-or-later

// Copyright (C) 2018 Rain <rainbreak@riseup.net>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity 0.6.12;

/// @title MakerDaoMath Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Helper functions for math operations adapted from MakerDao contracts
abstract contract MakerDaoMath {
    /// @dev Performs scaled, fixed-point exponentiation.
    /// Verbatim code, adapted to our style guide for variable naming only, see:
    /// https://github.com/makerdao/dss/blob/master/src/pot.sol#L83-L105
    // prettier-ignore
    function __rpow(uint256 _x, uint256 _n, uint256 _base) internal pure returns (uint256 z_) {
        assembly {
            switch _x case 0 {switch _n case 0 {z_ := _base} default {z_ := 0}}
            default {
                switch mod(_n, 2) case 0 { z_ := _base } default { z_ := _x }
                let half := div(_base, 2)
                for { _n := div(_n, 2) } _n { _n := div(_n,2) } {
                    let xx := mul(_x, _x)
                    if iszero(eq(div(xx, _x), _x)) { revert(0,0) }
                    let xxRound := add(xx, half)
                    if lt(xxRound, xx) { revert(0,0) }
                    _x := div(xxRound, _base)
                    if mod(_n,2) {
                        let zx := mul(z_, _x)
                        if and(iszero(iszero(_x)), iszero(eq(div(zx, _x), z_))) { revert(0,0) }
                        let zxRound := add(zx, half)
                        if lt(zxRound, zx) { revert(0,0) }
                        z_ := div(zxRound, _base)
                    }
                }
            }
        }

        return z_;
    }
}
