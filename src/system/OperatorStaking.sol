pragma solidity ^0.4.21;

import "ds-group/group.sol";
import "ds-math/math.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../version/VersionInterface.sol";
import "../assets/AssetInterface.sol";
import "./StakeBank.sol";

/// @title Operator Staking Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Enables pricefeed operators to self-select via staking
contract OperatorStaking is DBC, StakeBank {

    struct StakeData {
        uint amount;
        address staker;
    }

    uint public MAX_STAKERS = 100;  // maximum number of stakers; prevent array denial of service
    uint public minimumStake;
    uint public numOperators;
    uint public withdrawalDelay;
    mapping (address => bool) public isRanked;
    mapping (address => uint) public latestUnstakeTime;
    mapping (address => uint) public stakeToWithdraw;
    StakeData[] public stakeRanking;

    // TODO: consider renaming "operator" depending on how this is implemented 
    //  (i.e. is pricefeed staking itself?)
    function OperatorStaking(
        AssetInterface _stakingToken,
        uint _minimumStake,
        uint _numOperators,
        uint _withdrawalDelay
    )
        public
        StakeBank(_stakingToken)
    {
        minimumStake = _minimumStake;
        numOperators = _numOperators;
        withdrawalDelay = _withdrawalDelay;
    }

    // METHODS : STAKING

    function stake(
        uint amount,
        bytes data
    )
        public
        pre_cond(amount >= minimumStake)
        pre_cond(
            stakeRanking.length < MAX_STAKERS ||    // still room in array
            amount > stakeRanking[0].amount         // or larger than smallest element
        )
    {
        StakeBank.stake(amount, data);
        updateStakerRanking(msg.sender);
    }

    function stakeFor(
        address user,
        uint amount,
        bytes data
    )
        public
        pre_cond(amount >= minimumStake)
    {
        StakeBank.stakeFor(user, amount, data);
        updateStakerRanking(user);
    }

    function unstake(
        uint amount,
        bytes data
    )
        public
    {
        uint preStake = totalStakedFor(msg.sender);
        uint postStake = sub(preStake, amount);
        require(postStake >= minimumStake || postStake == 0);
        require(totalStakedFor(msg.sender) >= amount);
        updateCheckpointAtNow(stakesFor[msg.sender], amount, true);
        updateCheckpointAtNow(stakeHistory, amount, true);
        Unstaked(msg.sender, amount, totalStakedFor(msg.sender), data);
        latestUnstakeTime[msg.sender] = block.timestamp;
        stakeToWithdraw[msg.sender] += amount;
        updateStakerRanking(msg.sender);
    }

    function withdrawStake()
        public
        pre_cond(stakeToWithdraw[msg.sender] > 0)
        pre_cond(block.timestamp >= add(latestUnstakeTime[msg.sender], withdrawalDelay))
    {
        uint amount = stakeToWithdraw[msg.sender];
        stakeToWithdraw[msg.sender] = 0;
        require(stakingToken.transfer(msg.sender, amount));
    }

    function updateStakerRanking(address _staker) internal {
        uint newStakedAmount = totalStakedFor(_staker);
        if (newStakedAmount == 0) {
            isRanked[_staker] = false;
            removeStakerFromArray(_staker);
        } else if (isRanked[_staker]) {
            removeStakerFromArray(_staker);
            addStakerToArray(_staker, newStakedAmount);
        } else {
            isRanked[_staker] = true;
            addStakerToArray(_staker, newStakedAmount);
        }
    }

    function removeStakerFromArray(address _staker) internal {
        for (uint i; i < stakeRanking.length; i++) {
            if (stakeRanking[i].staker == _staker) {
                delete stakeRanking[i];
                for (uint j = i; j < stakeRanking.length-1; j++) {
                    stakeRanking[j] = stakeRanking[j+1];
                }
                break;
            }
        }
        stakeRanking.length--;
    }

    function addStakerToArray(address _staker, uint _amount) internal {
        StakeData memory newItem = StakeData({
            staker: _staker,
            amount: _amount
        });
        if (stakeRanking.length == 0) {
            stakeRanking.push(newItem);
        } else {
            for (uint i; i < stakeRanking.length; i++) {
                if (_amount < stakeRanking[i].amount) {
                    stakeRanking.length++;
                    for (uint j = stakeRanking.length-1; j > i; j--) {
                        stakeRanking[j] = stakeRanking[j-1];
                    }
                    stakeRanking[i] = newItem;
                    break;
                } else if (i == stakeRanking.length - 1) { // end of array
                    stakeRanking.length++;
                    stakeRanking[i+1] = newItem;
                    break;
                } else {
                    continue;
                }
            }
        }
    }

    // VIEW FUNCTIONS

    function isOperator(address user) view returns (bool) {
        address[] memory operators = getOperators();
        for (uint i; i < numOperators; i++) {
            if (operators[i] == user) {
                return true;
            }
        }
        return false;
    }

    function getOperators()
        view
        returns (address[])
    {
        uint arrLength = (numOperators > stakeRanking.length) ?
            stakeRanking.length :
            numOperators;
        address[] memory operators = new address[](arrLength);
        for (uint i; i < arrLength; i++) {
            operators[i] = stakeRanking[stakeRanking.length - (i+1)].staker;
        }
        return operators;
    }

    function getStakersAndAmounts()
        view
        returns (address[], uint[])
    {
        address[] memory stakers = new address[](stakeRanking.length);
        uint[] memory amounts = new uint[](stakeRanking.length);
        for (uint i; i < stakeRanking.length; i++) {
            stakers[i] = stakeRanking[i].staker;
            amounts[i] = stakeRanking[i].amount;
        }
        return (stakers, amounts);
    }
}
