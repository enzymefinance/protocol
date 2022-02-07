// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../../utils/AddressArrayLib.sol";
import "./IStakingWrapper.sol";

/// @title StakingWrapperBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base contract for staking wrappers
/// @dev Can be used as a base for both standard deployments and proxy targets.
/// Draws on Convex's ConvexStakingWrapper implementation (https://github.com/convex-eth/platform/blob/main/contracts/contracts/wrappers/ConvexStakingWrapper.sol),
/// which is based on Curve.fi gauge wrappers (https://github.com/curvefi/curve-dao-contracts/tree/master/contracts/gauges/wrappers)
abstract contract StakingWrapperBase is IStakingWrapper, ERC20, ReentrancyGuard {
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    event Deposited(address indexed from, address indexed to, uint256 amount);

    event PauseToggled(bool isPaused);

    event RewardsClaimed(
        address caller,
        address indexed user,
        address[] rewardTokens,
        uint256[] claimedAmounts
    );

    event RewardTokenAdded(address token);

    event TotalHarvestIntegralUpdated(address indexed rewardToken, uint256 integral);

    event TotalHarvestLastCheckpointBalanceUpdated(
        address indexed rewardToken,
        uint256 lastCheckpointBalance
    );

    event UserHarvestUpdated(
        address indexed user,
        address indexed rewardToken,
        uint256 integral,
        uint256 claimableReward
    );

    event Withdrawn(
        address indexed caller,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    uint256 private constant INTEGRAL_PRECISION = 1e18;
    address internal immutable OWNER;

    // Paused stops new deposits and checkpoints
    bool private paused;
    address[] private rewardTokens;
    mapping(address => TotalHarvestData) private rewardTokenToTotalHarvestData;
    mapping(address => mapping(address => UserHarvestData)) private rewardTokenToUserToHarvestData;

    modifier onlyOwner() {
        require(msg.sender == OWNER, "Only owner callable");
        _;
    }

    constructor(
        address _owner,
        string memory _tokenName,
        string memory _tokenSymbol
    ) public ERC20(_tokenName, _tokenSymbol) {
        OWNER = _owner;
    }

    /// @notice Toggles pause for deposit and harvesting new rewards
    /// @param _isPaused True if next state is paused, false if unpaused
    function togglePause(bool _isPaused) external onlyOwner {
        paused = _isPaused;

        emit PauseToggled(_isPaused);
    }

    ////////////////////////////
    // DEPOSITOR INTERACTIONS //
    ////////////////////////////

    // CLAIM REWARDS

    /// @notice Claims all rewards for a given account
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
        return __checkpointAndClaim(_for);
    }

    // DEPOSIT

    /// @notice Deposits tokens to be staked, minting staking token to sender
    /// @param _amount The amount of tokens to deposit
    function deposit(uint256 _amount) external override {
        __deposit(msg.sender, msg.sender, _amount);
    }

    /// @notice Deposits tokens to be staked, minting staking token to a specified account
    /// @param _to The account to receive staking tokens
    /// @param _amount The amount of tokens to deposit
    function depositTo(address _to, uint256 _amount) external override {
        __deposit(msg.sender, _to, _amount);
    }

    /// @dev Helper to deposit tokens to be staked
    function __deposit(
        address _from,
        address _to,
        uint256 _amount
    ) private nonReentrant {
        require(!isPaused(), "__deposit: Paused");

        // Checkpoint before minting
        __checkpoint([_to, address(0)]);
        _mint(_to, _amount);

        __depositLogic(_from, _amount);

        emit Deposited(_from, _to, _amount);
    }

    // WITHDRAWAL

    /// @notice Withdraws staked tokens, returning tokens to the sender, and optionally claiming rewards
    /// @param _amount The amount of tokens to withdraw
    /// @param _claimRewards True if accrued rewards should be claimed
    /// @return rewardTokens_ The reward tokens
    /// @return claimedAmounts_ The reward token amounts claimed
    /// @dev Setting `_claimRewards` to true will save gas over separate calls to withdraw + claim
    function withdraw(uint256 _amount, bool _claimRewards)
        external
        override
        returns (address[] memory rewardTokens_, uint256[] memory claimedAmounts_)
    {
        return __withdraw(msg.sender, msg.sender, _amount, _claimRewards);
    }

    /// @notice Withdraws staked tokens, returning tokens to a specified account,
    /// and optionally claims rewards to the staked token holder
    /// @param _to The account to receive tokens
    /// @param _amount The amount of tokens to withdraw
    function withdrawTo(
        address _to,
        uint256 _amount,
        bool _claimRewardsToHolder
    ) external override {
        __withdraw(msg.sender, _to, _amount, _claimRewardsToHolder);
    }

    /// @notice Withdraws staked tokens on behalf of AccountA, returning tokens to a specified AccountB,
    /// and optionally claims rewards to the staked token holder
    /// @param _onBehalf The account on behalf to withdraw
    /// @param _to The account to receive tokens
    /// @param _amount The amount of tokens to withdraw
    /// @dev The caller must have an adequate ERC20.allowance() for _onBehalf
    function withdrawToOnBehalf(
        address _onBehalf,
        address _to,
        uint256 _amount,
        bool _claimRewardsToHolder
    ) external override {
        // Validate and reduce sender approval
        _approve(_onBehalf, msg.sender, allowance(_onBehalf, msg.sender).sub(_amount));

        __withdraw(_onBehalf, _to, _amount, _claimRewardsToHolder);
    }

    /// @dev Helper to withdraw staked tokens
    function __withdraw(
        address _from,
        address _to,
        uint256 _amount,
        bool _claimRewards
    )
        private
        nonReentrant
        returns (address[] memory rewardTokens_, uint256[] memory claimedAmounts_)
    {
        // Checkpoint before burning
        if (_claimRewards) {
            (rewardTokens_, claimedAmounts_) = __checkpointAndClaim(_from);
        } else {
            __checkpoint([_from, address(0)]);
        }

        _burn(_from, _amount);

        __withdrawLogic(_to, _amount);

        emit Withdrawn(msg.sender, _from, _to, _amount);

        return (rewardTokens_, claimedAmounts_);
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
        return
            balanceOf(_account).mul(_totalHarvestIntegral.sub(_userHarvestIntegral)).div(
                INTEGRAL_PRECISION
            );
    }

    /// @dev Helper to calculate an unaccounted for integral amount based on checkpoint balance diff
    function __calcIntegralForBalDiff(
        uint256 _supply,
        uint256 _currentBalance,
        uint256 _lastCheckpointBalance
    ) private pure returns (uint256 integral_) {
        if (_supply > 0) {
            uint256 balDiff = _currentBalance.sub(_lastCheckpointBalance);
            if (balDiff > 0) {
                return balDiff.mul(INTEGRAL_PRECISION).div(_supply);
            }
        }

        return 0;
    }

    /// @dev Helper to checkpoint harvest data for specified accounts.
    /// Harvests all rewards prior to checkpoint.
    function __checkpoint(address[2] memory _accounts) private {
        // If paused, continue to checkpoint, but don't attempt to get new rewards
        if (!isPaused()) {
            __harvestRewardsLogic();
        }

        uint256 supply = totalSupply();

        uint256 rewardTokensLength = rewardTokens.length;
        for (uint256 i; i < rewardTokensLength; i++) {
            __updateHarvest(rewardTokens[i], _accounts, supply);
        }
    }

    /// @dev Helper to checkpoint harvest data for specified accounts.
    /// Harvests all rewards prior to checkpoint.
    function __checkpointAndClaim(address _account)
        private
        returns (address[] memory rewardTokens_, uint256[] memory claimedAmounts_)
    {
        // If paused, continue to checkpoint, but don't attempt to get new rewards
        if (!isPaused()) {
            __harvestRewardsLogic();
        }

        uint256 supply = totalSupply();

        rewardTokens_ = rewardTokens;
        claimedAmounts_ = new uint256[](rewardTokens_.length);
        for (uint256 i; i < rewardTokens_.length; i++) {
            claimedAmounts_[i] = __updateHarvestAndClaim(rewardTokens_[i], _account, supply);
        }

        emit RewardsClaimed(msg.sender, _account, rewardTokens_, claimedAmounts_);

        return (rewardTokens_, claimedAmounts_);
    }

    /// @dev Helper to update harvest data
    function __updateHarvest(
        address _rewardToken,
        address[2] memory _accounts,
        uint256 _supply
    ) private {
        TotalHarvestData storage totalHarvestData = rewardTokenToTotalHarvestData[_rewardToken];

        uint256 totalIntegral = totalHarvestData.integral;
        uint256 bal = ERC20(_rewardToken).balanceOf(address(this));
        uint256 integralToAdd = __calcIntegralForBalDiff(
            _supply,
            bal,
            totalHarvestData.lastCheckpointBalance
        );
        if (integralToAdd > 0) {
            totalIntegral = totalIntegral.add(integralToAdd);
            totalHarvestData.integral = uint128(totalIntegral);
            emit TotalHarvestIntegralUpdated(_rewardToken, totalIntegral);

            totalHarvestData.lastCheckpointBalance = uint128(bal);
            emit TotalHarvestLastCheckpointBalanceUpdated(_rewardToken, bal);
        }

        for (uint256 i; i < _accounts.length; i++) {
            // skip address(0), passed in upon mint and burn
            if (_accounts[i] == address(0)) continue;


                UserHarvestData storage userHarvestData
             = rewardTokenToUserToHarvestData[_rewardToken][_accounts[i]];

            uint256 userIntegral = userHarvestData.integral;
            if (userIntegral < totalIntegral) {
                uint256 claimableReward = uint256(userHarvestData.claimableReward).add(
                    __calcClaimableRewardForIntegralDiff(_accounts[i], totalIntegral, userIntegral)
                );

                userHarvestData.claimableReward = uint128(claimableReward);
                userHarvestData.integral = uint128(totalIntegral);

                emit UserHarvestUpdated(
                    _accounts[i],
                    _rewardToken,
                    totalIntegral,
                    claimableReward
                );
            }
        }
    }

    /// @dev Helper to update harvest data and claim all rewards to holder
    function __updateHarvestAndClaim(
        address _rewardToken,
        address _account,
        uint256 _supply
    ) private returns (uint256 claimedAmount_) {
        TotalHarvestData storage totalHarvestData = rewardTokenToTotalHarvestData[_rewardToken];

        uint256 totalIntegral = totalHarvestData.integral;
        uint256 integralToAdd = __calcIntegralForBalDiff(
            _supply,
            ERC20(_rewardToken).balanceOf(address(this)),
            totalHarvestData.lastCheckpointBalance
        );
        if (integralToAdd > 0) {
            totalIntegral = totalIntegral.add(integralToAdd);
            totalHarvestData.integral = uint128(totalIntegral);

            emit TotalHarvestIntegralUpdated(_rewardToken, totalIntegral);
        }


            UserHarvestData storage userHarvestData
         = rewardTokenToUserToHarvestData[_rewardToken][_account];

        uint256 userIntegral = userHarvestData.integral;
        claimedAmount_ = userHarvestData.claimableReward;
        if (userIntegral < totalIntegral) {
            userHarvestData.integral = uint128(totalIntegral);
            claimedAmount_ = claimedAmount_.add(
                __calcClaimableRewardForIntegralDiff(_account, totalIntegral, userIntegral)
            );

            emit UserHarvestUpdated(_account, _rewardToken, totalIntegral, claimedAmount_);
        }

        if (claimedAmount_ > 0) {
            userHarvestData.claimableReward = 0;
            ERC20(_rewardToken).safeTransfer(_account, claimedAmount_);

            emit UserHarvestUpdated(_account, _rewardToken, totalIntegral, 0);
        }

        // Repeat balance lookup since the reward token could have irregular transfer behavior
        uint256 finalBal = ERC20(_rewardToken).balanceOf(address(this));
        if (finalBal < totalHarvestData.lastCheckpointBalance) {
            totalHarvestData.lastCheckpointBalance = uint128(finalBal);

            emit TotalHarvestLastCheckpointBalanceUpdated(_rewardToken, finalBal);
        }

        return claimedAmount_;
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

    /// @dev Overrides ERC20._transfer() in order to checkpoint sender and recipient pre-transfer rewards
    function _transfer(
        address _from,
        address _to,
        uint256 _amount
    ) internal override nonReentrant {
        __checkpoint([_from, _to]);
        super._transfer(_from, _to, _amount);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the reward token at a particular index
    /// @return rewardToken_ The reward token address
    function getRewardTokenAtIndex(uint256 _index)
        public
        view
        override
        returns (address rewardToken_)
    {
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
