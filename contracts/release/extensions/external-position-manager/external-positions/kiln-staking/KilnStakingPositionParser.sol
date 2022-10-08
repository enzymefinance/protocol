// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IKilnDepositContract.sol";
import "../IExternalPositionParser.sol";
import "./IKilnStakingPosition.sol";
import "./KilnStakingPositionDataDecoder.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title KilnStakingPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Kiln Staking Positions
contract KilnStakingPositionParser is KilnStakingPositionDataDecoder, IExternalPositionParser {
    using SafeMath for uint256;

    uint256 public constant ETH_AMOUNT_PER_NODE = 32 ether;

    IKilnDepositContract public immutable KILN_DEPOSIT_CONTRACT;
    address public immutable WETH_TOKEN;

    constructor(address _kilnDepositContract, address _weth) public {
        KILN_DEPOSIT_CONTRACT = IKilnDepositContract(_kilnDepositContract);
        WETH_TOKEN = _weth;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPosition The ExternalPositionProxy address
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address _externalPosition,
        uint256 _actionId,
        bytes memory _encodedActionArgs
    )
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(IKilnStakingPosition.Actions.Stake)) {
            uint256 validatorAmount = __decodeStakeActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = WETH_TOKEN;
            amountsToTransfer_[0] = validatorAmount.mul(ETH_AMOUNT_PER_NODE);
        } else if (_actionId == uint256(IKilnStakingPosition.Actions.ClaimFees)) {
            (bytes[] memory publicKeys, ) = __decodeClaimFeesAction(_encodedActionArgs);

            for (uint256 i; i < publicKeys.length; i++) {
                require(
                    KILN_DEPOSIT_CONTRACT.getWithdrawer(publicKeys[i]) == _externalPosition,
                    "parseAssetsForAction: Invalid validator"
                );
            }

            assetsToReceive_ = new address[](1);

            assetsToReceive_[0] = WETH_TOKEN;
        } else if (_actionId == uint256(IKilnStakingPosition.Actions.WithdrawEth)) {
            assetsToReceive_ = new address[](1);

            assetsToReceive_[0] = WETH_TOKEN;
        }
        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @return initArgs_ Parsed and encoded args for ExternalPositionProxy.init()
    function parseInitArgs(address, bytes memory)
        external
        override
        returns (bytes memory initArgs_)
    {
        return "";
    }
}
