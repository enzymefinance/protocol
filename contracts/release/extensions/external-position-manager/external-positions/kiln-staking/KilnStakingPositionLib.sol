// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ERC20} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";
import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IKilnStakingContract} from "../../../../../external-interfaces/IKilnStakingContract.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {KilnStakingPositionLibBase2} from "./bases/KilnStakingPositionLibBase2.sol";
import {IKilnStakingPosition} from "./IKilnStakingPosition.sol";
import {KilnStakingPositionDataDecoder} from "./KilnStakingPositionDataDecoder.sol";

/// @title KilnStakingPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Kiln Staking Positions
contract KilnStakingPositionLib is IKilnStakingPosition, KilnStakingPositionDataDecoder, KilnStakingPositionLibBase2 {
    using SafeERC20 for ERC20;

    uint256 internal constant ETH_AMOUNT_PER_NODE = 32 ether;

    uint256 internal immutable EXITED_VALIDATOR_ETH_THRESHOLD;
    IWETH internal immutable WETH_TOKEN;

    constructor(address _wethToken, uint256 _exitedValidatorEthThreshold) {
        EXITED_VALIDATOR_ETH_THRESHOLD = _exitedValidatorEthThreshold;
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
        } else if (actionId == uint256(Actions.SweepEth)) {
            __sweepEth();
        } else if (actionId == uint256(Actions.Unstake)) {
            __unstake(actionArgs);
        } else if (actionId == uint256(Actions.PausePositionValue)) {
            __pausePositionValue();
        } else if (actionId == uint256(Actions.UnpausePositionValue)) {
            __unpausePositionValue();
        }
    }

    /// @dev Claims Fees generated from a given validator set
    function __claimFees(bytes memory _actionArgs) private {
        (address stakingContractAddress, bytes[] memory publicKeys, IKilnStakingPosition.ClaimFeeTypes claimFeesType) =
            __decodeClaimFeesAction(_actionArgs);

        if (claimFeesType == ClaimFeeTypes.ExecutionLayer) {
            __claimELFees({_stakingContractAddress: stakingContractAddress, _publicKeys: publicKeys});
        } else if (claimFeesType == ClaimFeeTypes.ConsensusLayer) {
            __claimCLFees({_stakingContractAddress: stakingContractAddress, _publicKeys: publicKeys});
        } else if (claimFeesType == ClaimFeeTypes.All) {
            // Do each claim type separately instead of Kiln's combined action,
            // since CL rewards need to be monitored to determine validator exits
            __claimCLFees({_stakingContractAddress: stakingContractAddress, _publicKeys: publicKeys});
            __claimELFees({_stakingContractAddress: stakingContractAddress, _publicKeys: publicKeys});
        } else {
            revert("__claimFees: Unsupported claimFee type");
        }

        __sweepEth();
    }

    /// @dev Helper to claim consensus layer fees within the ClaimFees action
    function __claimCLFees(address _stakingContractAddress, bytes[] memory _publicKeys) private {
        uint256 validatorsToRemove;

        for (uint256 i; i < _publicKeys.length; i++) {
            bytes memory publicKey = _publicKeys[i];

            // Use the accumulated ETH to assess whether a validator was exited, and remove it from the validator count if so.
            // The Kiln StakingContract only knows about validators that have been _requested_ to exit and then exited,
            // but does not attempt to identify validators that have been forcibly exited, i.e., due to slashing.
            // Here, the accumulated ETH balance withdrawn from the consensus layer is used as a proxy
            // to determine whether a validator has been exited, whether or not intentionally.
            // `EXITED_VALIDATOR_ETH_THRESHOLD` must be:
            // - high enough so that spoofing an exit via a direct ETH transfer is insignificant to share price arbitrage
            // - low enough to probabilistically catch nearly all slashing penalty exits
            if (
                IKilnStakingContract(_stakingContractAddress).getCLFeeRecipient(publicKey).balance
                    >= EXITED_VALIDATOR_ETH_THRESHOLD
            ) {
                validatorsToRemove += 1;
            }

            // Claim the fees
            IKilnStakingContract(_stakingContractAddress).withdrawCLFee(publicKey);
        }

        // Decrease validator count if any validators were exited
        if (validatorsToRemove > 0) {
            // Prevent underflow so rewards can never be unclaimable
            validatorsToRemove = Math.min(validatorsToRemove, getValidatorCount());
            if (validatorsToRemove > 0) {
                validatorCount -= validatorsToRemove;

                emit ValidatorsRemoved(_stakingContractAddress, validatorsToRemove);
            }
        }
    }

    /// @dev Helper to claim execution layer fees within the ClaimFees action
    function __claimELFees(address _stakingContractAddress, bytes[] memory _publicKeys) private {
        for (uint256 i; i < _publicKeys.length; i++) {
            IKilnStakingContract(_stakingContractAddress).withdrawELFee(_publicKeys[i]);
        }
    }

    /// @dev Helper to pause position valuation
    function __pausePositionValue() private {
        require(!positionValueIsPaused(), "__pausePositionValue: Already paused");

        positionValuePaused = true;

        emit PositionValuePaused();
    }

    /// @dev Stakes ETH to Kiln deposit contract
    function __stake(bytes memory _actionArgs) private {
        (address stakingContractAddress, uint256 validatorAmount) = __decodeStakeActionArgs(_actionArgs);

        uint256 amountStaked = validatorAmount * ETH_AMOUNT_PER_NODE;

        WETH_TOKEN.withdraw(amountStaked);

        IKilnStakingContract(stakingContractAddress).deposit{value: amountStaked}();

        validatorCount += validatorAmount;

        emit ValidatorsAdded(stakingContractAddress, validatorAmount);
    }

    /// @dev Sweeps ETH balance from the external position into the vault
    function __sweepEth() private {
        uint256 amount = address(this).balance;

        WETH_TOKEN.deposit{value: amount}();

        ERC20(address(WETH_TOKEN)).safeTransfer(msg.sender, amount);
    }

    /// @dev Helper to unpause position valuation
    function __unpausePositionValue() private {
        require(positionValueIsPaused(), "__unpausePositionValue: Not paused");

        positionValuePaused = false;

        emit PositionValueUnpaused();
    }

    /// @dev Joins the exit queue for specified Kiln validators
    function __unstake(bytes memory _actionArgs) private {
        (address stakingContractAddress, bytes memory publicKeys) = __decodeUnstakeActionArgs(_actionArgs);

        // Join the exit queue
        IKilnStakingContract(stakingContractAddress).requestValidatorsExit(publicKeys);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        require(!positionValueIsPaused(), "getManagedAssets: Valuation paused");

        assets_ = new address[](1);
        amounts_ = new uint256[](1);

        assets_[0] = address(WETH_TOKEN);
        // Do not include local ETH balance, as:
        // - there should never be a local ETH balance now that Kiln's claiming functions cannot be called by unauthorized parties
        // - if there is a balance, it's because the admin called the claiming functions, which would lead to a correctness issue
        // - even in that case, it still needs asset manager action to sweep into the vault,
        //   thus giving them an opportunity to pause the position value and reconcile
        amounts_[0] = validatorCount * ETH_AMOUNT_PER_NODE;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the current amount of validators used by the external position
    /// @return validatorCount_ The total amount of validators
    function getValidatorCount() public view returns (uint256 validatorCount_) {
        return validatorCount;
    }

    /// @notice Checks whether the position valuation logic is paused
    /// @return paused_ True if paused
    function positionValueIsPaused() public view returns (bool paused_) {
        return positionValuePaused;
    }
}
