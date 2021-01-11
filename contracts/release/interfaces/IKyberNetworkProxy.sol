// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title Kyber Network interface
interface IKyberNetworkProxy {
    function swapEtherToToken(address, uint256) external payable returns (uint256);

    function swapTokenToEther(
        address,
        uint256,
        uint256
    ) external returns (uint256);

    function swapTokenToToken(
        address,
        uint256,
        address,
        uint256
    ) external returns (uint256);
}
