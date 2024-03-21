// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2PtOracle Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2PtOracle {
    function getPtToAssetRate(address _market, uint32 _duration) external view returns (uint256 ptToAssetRate_);

    function getOracleState(address _market, uint32 _duration)
        external
        view
        returns (bool increaseCardinalityRequired_, uint16 cardinalityRequired_, bool oldestObservationSatisfied_);
}
