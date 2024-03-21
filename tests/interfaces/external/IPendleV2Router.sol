// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2Router Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2Router {
    struct ApproxParams {
        uint256 guessMin;
        uint256 guessMax;
        uint256 guessOffchain;
        uint256 maxIteration;
        uint256 eps;
    }
}
