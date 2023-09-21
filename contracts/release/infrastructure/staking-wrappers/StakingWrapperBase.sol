// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ReentrancyGuard} from "openzeppelin-solc-0.8/security/ReentrancyGuard.sol";
import {ERC20} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";
import {AddressArrayLib} from "../../../utils/0.8.19/AddressArrayLib.sol";
import {IStakingWrapper} from "./IStakingWrapper.sol";

/// @title StakingWrapperBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base contract for staking wrappers
/// @dev Can be used as a base for both standard deployments and proxy targets
abstract contract StakingWrapperBase is IStakingWrapper, ERC20, ReentrancyGuard {
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;

    event Deposited(address indexed from, address indexed to, uint256 amount);

    event PauseToggled(bool isPaused);

    event RewardTokenAdded(address token);

    event TotalHarvestIntegralUpdated(address indexed rewardToken, uint256 integral);

    event TotalHarvestLastCheckpointBalanceUpdated(address indexed rewardToken, uint256 lastCheckpointBalance);

    event UserHarvestUpdated(
        address indexed user, address indexed rewardToken, uint256 integral, uint256 claimableReward
    );

    event Withdrawn(address indexed caller, address indexed from, address indexed to, uint256 amount);

    uint8 private constant DEFAULT_DECIMALS = 18;
    uint256 private constant INTEGRAL_PRECISION = 1e18;
    address internal immutable OWNER;

    // `paused` blocks new deposits
    bool private paused;
    address[] private rewardTokens;
    mapping(address => TotalHarvestData) private rewardTokenToTotalHarvestData;
    mapping(address => mapping(address => UserHarvestData)) private rewardTokenToUserToHarvestData;

    modifier notEmpty(address _account) {
        require(_account != address(0), "Empty account");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == OWNER, "Only owner callable");
        _;
    }

    constructor(address _owner, string memory _tokenName, string memory _tokenSymbol) ERC20(_tokenName, _tokenSymbol) {
        OWNER = _owner;
    }

    /// @notice Toggles pause for deposits
    /// @param _isPaused True if next state is paused, false if unpaused
    function togglePause(bool _isPaused) external override onlyOwner {
        paused = _isPaused;

        emit PauseToggled(_isPaused);
    }

    ////////////////////////////
    // DEPOSITOR INTERACTIONS //
    ////////////////////////////

    // CLAIM REWARDS

    /// @notice Claims all rewards for a given account, including any accrued since the last checkpoint
    /// @param _for The account for which to claim rewards
    /// @return rewardTokens_ The reward tokens
    /// @return claimedAmounts_ The reward token amounts claimed
    /// @dev Can be called off-chain to simulate the total harvestable rewards for a particular user
    function claimRewardsFor(address _for)
        external
        override
        nonReentrant
        returns (address[] memory rewardTokens_, uint256[] memory claimedAmounts_)
    {
        __checkpoint([_for, address(0)]);

        return __claimRewardTokens(_for);
    }

    /// @notice Claims all rewards for a given account, not including any accrued since the last checkpoint
    /// @param _for The account for which to claim rewards
    /// @return rewardTokens_ The reward tokens
    /// @return claimedAmounts_ The reward token amounts claimed
    /// @dev Can be called off-chain to simulate the total harvestable rewards for a particular user.
    /// Does NOT give up claim to rewards accrued since the last checkpoint.
    function claimRewardsForWithoutCheckpoint(address _for)
        external
        override
        nonReentrant
        returns (address[] memory rewardTokens_, uint256[] memory claimedAmounts_)
    {
        return __claimRewardTokens(_for);
    }

    // DEPOSIT

    /// @notice Deposits tokens to be staked, minting staking token to a specified account
    /// @param _to The account to receive staking tokens
    /// @param _amount The amount of tokens to deposit
    function depositTo(address _to, uint256 _amount) external override {
        __deposit({_from: msg.sender, _to: _to, _amount: _amount});
    }

    /// @dev Helper to deposit tokens to be staked
    function __deposit(address _from, address _to, uint256 _amount) private nonReentrant notEmpty(_to) {
        require(!isPaused(), "__deposit: Paused");

        // Checkpoint before minting
        __checkpoint([_to, address(0)]);
        _mint(_to, _amount);

        __depositLogic({_onBehalf: _from, _amount: _amount});

        emit Deposited(_from, _to, _amount);
    }

    // WITHDRAWAL

    /// @notice Withdraws staked tokens, returning tokens to a specified account
    /// @param _to The account to receive tokens
    /// @param _amount The amount of tokens to withdraw
    function withdrawTo(address _to, uint256 _amount) external override {
        __withdraw({_from: msg.sender, _to: _to, _amount: _amount, _checkpoint: true});
    }

    /// @notice Withdraws staked tokens on behalf of AccountA, returning tokens to a specified AccountB
    /// @param _onBehalf The account on behalf to withdraw
    /// @param _to The account to receive tokens
    /// @param _amount The amount of tokens to withdraw
    /// @dev The caller must have an adequate ERC20.allowance() for _onBehalf
    function withdrawToOnBehalf(address _onBehalf, address _to, uint256 _amount) external override {
        // Validate and reduce sender approval
        _approve(_onBehalf, msg.sender, allowance(_onBehalf, msg.sender) - _amount);

        __withdraw({_from: _onBehalf, _to: _to, _amount: _amount, _checkpoint: true});
    }

    /// @notice Withdraws staked tokens, returning tokens to a specified account,
    /// but giving up any rewards accrued since the previous checkpoint
    /// @param _to The account to receive tokens
    /// @param _amount The amount of tokens to withdraw
    /// @dev Simply runs withdrawal logic without checkpointing rewards, in case of rewards-related failure.
    /// Redeemer can still claim rewards accrued up to the previous checkpoint.
    function withdrawToWithoutCheckpoint(address _to, uint256 _amount) external override {
        __withdraw({_from: msg.sender, _to: _to, _amount: _amount, _checkpoint: false});
    }

    /// @dev Helper to withdraw staked tokens
    function __withdraw(address _from, address _to, uint256 _amount, bool _checkpoint)
        private
        nonReentrant
        notEmpty(_to)
    {
        // Checkpoint before burning
        if (_checkpoint) {
            __checkpoint([_from, address(0)]);
        }

        _burn(_from, _amount);

        __withdrawLogic({_to: _to, _amount: _amount});

        emit Withdrawn(msg.sender, _from, _to, _amount);
    }

    /////////////
    // REWARDS //
    /////////////

    // Rewards tokens are added by the inheriting contract. Rewards tokens should be added, but not removed.
    // If new rewards tokens need to be added over time, that logic must be handled by the inheriting contract,
    // and can make use of __harvestRewardsLogic() if necessary

    // INTERNAL FUNCTIONS

    /// @dev Helper to add new reward tokens. Silently ignores duplicates.
    function __addRewardToken(address _rewardToken) internal {
        if (!rewardTokens.contains(_rewardToken)) {
            rewardTokens.push(_rewardToken);

            emit RewardTokenAdded(_rewardToken);
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate an unaccounted for reward amount due to a user based on integral values
    function __calcClaimableRewardForIntegralDiff(
        address _account,
        uint256 _totalHarvestIntegral,
        uint256 _userHarvestIntegral
    ) private view returns (uint256 claimableReward_) {
        return balanceOf(_account) * (_totalHarvestIntegral - _userHarvestIntegral) / INTEGRAL_PRECISION;
    }

    /// @dev Helper to calculate an unaccounted for integral amount based on checkpoint balance diff
    function __calcIntegralForBalDiff(uint256 _supply, uint256 _currentBalance, uint256 _lastCheckpointBalance)
        private
        pure
        returns (uint256 integral_)
    {
        if (_supply > 0) {
            uint256 balDiff = _currentBalance - _lastCheckpointBalance;
            if (balDiff > 0) {
                return balDiff * INTEGRAL_PRECISION / _supply;
            }
        }

        return 0;
    }

    /// @dev Helper to checkpoint harvest data for specified accounts.
    /// Harvests all rewards prior to checkpoint.
    function __checkpoint(address[2] memory _accounts) private {
        __harvestRewardsLogic();

        uint256 supply = totalSupply();

        uint256 rewardTokensLength = rewardTokens.length;
        for (uint256 i; i < rewardTokensLength; i++) {
            __checkpointRewardToken({_rewardToken: rewardTokens[i], _accounts: _accounts, _supply: supply});
        }
    }

    /// @dev Helper to update harvest data
    function __checkpointRewardToken(address _rewardToken, address[2] memory _accounts, uint256 _supply) internal {
        TotalHarvestData storage totalHarvestData = rewardTokenToTotalHarvestData[_rewardToken];

        uint256 totalIntegral = totalHarvestData.integral;
        uint256 bal = ERC20(_rewardToken).balanceOf(address(this));
        uint256 integralToAdd = __calcIntegralForBalDiff({
            _supply: _supply,
            _currentBalance: bal,
            _lastCheckpointBalance: totalHarvestData.lastCheckpointBalance
        });
        if (integralToAdd > 0) {
            totalIntegral = totalIntegral + integralToAdd;
            totalHarvestData.integral = uint128(totalIntegral);
            emit TotalHarvestIntegralUpdated(_rewardToken, totalIntegral);

            totalHarvestData.lastCheckpointBalance = uint128(bal);
            emit TotalHarvestLastCheckpointBalanceUpdated(_rewardToken, bal);
        }

        for (uint256 i; i < _accounts.length; i++) {
            // skip address(0), passed in upon mint and burn
            if (_accounts[i] == address(0)) continue;

            UserHarvestData storage userHarvestData = rewardTokenToUserToHarvestData[_rewardToken][_accounts[i]];

            uint256 userIntegral = userHarvestData.integral;
            if (userIntegral < totalIntegral) {
                uint256 claimableReward = uint256(userHarvestData.claimableReward)
                    + __calcClaimableRewardForIntegralDiff({
                        _account: _accounts[i],
                        _totalHarvestIntegral: totalIntegral,
                        _userHarvestIntegral: userIntegral
                    });
                userHarvestData.claimableReward = uint128(claimableReward);
                userHarvestData.integral = uint128(totalIntegral);

                emit UserHarvestUpdated(_accounts[i], _rewardToken, totalIntegral, claimableReward);
            }
        }
    }

    /// @dev Helper to claim all reward tokens for an account
    function __claimRewardTokens(address _account)
        private
        returns (address[] memory rewardTokens_, uint256[] memory claimedAmounts_)
    {
        rewardTokens_ = getRewardTokens();
        uint256 rewardTokensLength = rewardTokens_.length;
        claimedAmounts_ = new uint256[](rewardTokensLength);

        for (uint256 i; i < rewardTokensLength; i++) {
            ERC20 rewardToken = ERC20(rewardTokens_[i]);
            UserHarvestData storage userHarvestData = rewardTokenToUserToHarvestData[address(rewardToken)][_account];

            uint256 claimableAmount = userHarvestData.claimableReward;
            if (claimableAmount > 0) {
                claimedAmounts_[i] = claimableAmount;

                // Set the user's claimable reward to 0
                userHarvestData.claimableReward = 0;

                emit UserHarvestUpdated(_account, address(rewardToken), userHarvestData.integral, 0);

                ERC20(rewardToken).safeTransfer(_account, claimableAmount);
            }
        }

        return (rewardTokens_, claimedAmounts_);
    }

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to be run during a deposit, specific to the integrated protocol.
    /// Do not mint staking tokens, which already happens during __deposit().
    function __depositLogic(address _onBehalf, uint256 _amount) internal virtual;

    /// @dev Logic to be run during a checkpoint to harvest new rewards, specific to the integrated protocol.
    /// Can also be used to add new rewards tokens dynamically.
    /// Do not checkpoint, only harvest the rewards.
    function __harvestRewardsLogic() internal virtual;

    /// @dev Logic to be run during a withdrawal, specific to the integrated protocol.
    /// Do not burn staking tokens, which already happens during __withdraw().
    function __withdrawLogic(address _to, uint256 _amount) internal virtual;

    /////////////////////
    // ERC20 OVERRIDES //
    /////////////////////

    /// @notice Gets the token decimals
    /// @return decimals_ The token decimals
    /// @dev Implementing contracts should override to set different decimals
    function decimals() public view virtual override returns (uint8 decimals_) {
        return DEFAULT_DECIMALS;
    }

    /// @dev Overrides ERC20._transfer() in order to checkpoint sender and recipient pre-transfer rewards
    function _transfer(address _from, address _to, uint256 _amount) internal override nonReentrant {
        __checkpoint([_from, _to]);
        super._transfer(_from, _to, _amount);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the reward token at a particular index
    /// @return rewardToken_ The reward token address
    function getRewardTokenAtIndex(uint256 _index) public view override returns (address rewardToken_) {
        return rewardTokens[_index];
    }

    /// @notice Gets the count of reward tokens being harvested
    /// @return count_ The count
    function getRewardTokenCount() public view override returns (uint256 count_) {
        return rewardTokens.length;
    }

    /// @notice Gets all reward tokens being harvested
    /// @return rewardTokens_ The reward tokens
    function getRewardTokens() public view override returns (address[] memory rewardTokens_) {
        return rewardTokens;
    }

    /// @notice Gets the TotalHarvestData for a specified reward token
    /// @param _rewardToken The reward token
    /// @return totalHarvestData_ The TotalHarvestData
    function getTotalHarvestDataForRewardToken(address _rewardToken)
        public
        view
        override
        returns (TotalHarvestData memory totalHarvestData_)
    {
        return rewardTokenToTotalHarvestData[_rewardToken];
    }

    /// @notice Gets the UserHarvestData for a specified account and reward token
    /// @param _user The account
    /// @param _rewardToken The reward token
    /// @return userHarvestData_ The UserHarvestData
    function getUserHarvestDataForRewardToken(address _user, address _rewardToken)
        public
        view
        override
        returns (UserHarvestData memory userHarvestData_)
    {
        return rewardTokenToUserToHarvestData[_rewardToken][_user];
    }

    /// @notice Checks if deposits and new reward harvesting are paused
    /// @return isPaused_ True if paused
    function isPaused() public view override returns (bool isPaused_) {
        return paused;
    }
}
