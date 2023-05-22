// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../../persistent/external-positions/kiln-staking/KilnStakingPositionLibBase1.sol";
import "../../../../../external-interfaces/IKilnStakingContract.sol";
import "../../../../../external-interfaces/IWETH.sol";
import "./IKilnStakingPosition.sol";
import "./KilnStakingPositionDataDecoder.sol";

/// @title KilnStakingPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Kiln Staking Positions
contract KilnStakingPositionLib is
    IKilnStakingPosition,
    KilnStakingPositionDataDecoder,
    KilnStakingPositionLibBase1
{
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    uint256 public constant ETH_AMOUNT_PER_NODE = 32 ether;

    IWETH public immutable WETH_TOKEN;

    constructor(address _wethToken) public {
        WETH_TOKEN = IWETH(_wethToken);
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.Stake)) {
            __stake(actionArgs);
        } else if (actionId == uint256(Actions.ClaimFees)) {
            __claimFees(actionArgs);
        } else if (actionId == uint256(Actions.WithdrawEth)) {
            __withdrawEth();
        }
    }

    /// @dev Claims Fees generated from a given validator
    function __claimFees(bytes memory _actionArgs) private {
        (
            address stakingContractAddress,
            bytes[] memory publicKeys,
            IKilnStakingPosition.ClaimFeeTypes claimFeesType
        ) = __decodeClaimFeesAction(_actionArgs);

        if (claimFeesType == ClaimFeeTypes.ExecutionLayer) {
            for (uint256 i; i < publicKeys.length; i++) {
                IKilnStakingContract(stakingContractAddress).withdrawELFee(publicKeys[i]);
            }
        } else if (claimFeesType == ClaimFeeTypes.ConsensusLayer) {
            for (uint256 i; i < publicKeys.length; i++) {
                IKilnStakingContract(stakingContractAddress).withdrawCLFee(publicKeys[i]);
            }
        } else if (claimFeesType == ClaimFeeTypes.All) {
            for (uint256 i; i < publicKeys.length; i++) {
                IKilnStakingContract(stakingContractAddress).withdraw(publicKeys[i]);
            }
        } else {
            revert("__claimFees: Unsupported claimFee type");
        }

        __withdrawEth();
    }

    /// @dev Stakes ETH to Kiln deposit contract
    function __stake(bytes memory _actionArgs) private {
        (address stakingContractAddress, uint256 validatorAmount) = __decodeStakeActionArgs(
            _actionArgs
        );

        uint256 amountStaked = validatorAmount.mul(ETH_AMOUNT_PER_NODE);

        WETH_TOKEN.withdraw(amountStaked);

        IKilnStakingContract(stakingContractAddress).deposit{value: amountStaked}();

        validatorCount = validatorCount.add(validatorAmount);

        emit ValidatorsAdded(stakingContractAddress, validatorAmount);
    }

    /// @dev Withdraws ETH balance from the external position
    function __withdrawEth() private {
        uint256 amount = address(this).balance;

        WETH_TOKEN.deposit{value: amount}();

        ERC20(address(WETH_TOKEN)).safeTransfer(msg.sender, amount);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        assets_ = new address[](1);
        amounts_ = new uint256[](1);

        assets_[0] = address(WETH_TOKEN);
        amounts_[0] = (validatorCount.mul(ETH_AMOUNT_PER_NODE)).add(address(this).balance);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the current amount of validators used by the external position
    /// @return validatorCount_ The total amount of validators
    function getValidatorCount() public view returns (uint256 validatorCount_) {
        return validatorCount;
    }
}
