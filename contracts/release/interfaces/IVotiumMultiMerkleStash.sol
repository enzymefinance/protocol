// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title IVotiumMultiMerkleStash Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IVotiumMultiMerkleStash {
    struct ClaimParam {
        address token;
        uint256 index;
        uint256 amount;
        bytes32[] merkleProof;
    }

    function claimMulti(address, ClaimParam[] calldata) external;
}
