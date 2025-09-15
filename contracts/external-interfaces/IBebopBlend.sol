// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IBebopBlend Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IBebopBlend {
    struct Single {
        uint256 expiry;
        address taker_address;
        address maker_address;
        uint256 maker_nonce;
        address taker_token;
        address maker_token;
        uint256 taker_amount;
        uint256 maker_amount;
        address receiver;
        uint256 packed_commands;
        uint256 flags;
    }

    struct MakerSignature {
        bytes signatureBytes;
        uint256 flags;
    }

    function swapSingle(Single memory order, MakerSignature memory makerSignature, uint256 filledTakerAmount)
        external
        payable;
}
