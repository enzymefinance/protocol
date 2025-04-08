// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IMerklDistributor interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMerklDistributor {
    struct MerkleTree {
        bytes32 merkleRoot;
        bytes32 ipfsHash;
    }

    function updateTree(MerkleTree calldata _tree) external;

    function core() external view returns (address core_);

    function claimed(address _user, address _token) external view returns (uint256 amount_);
}
