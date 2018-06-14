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

    // TYPES

    struct StakeData {
        uint amount;
        address staker;
    }

    // Circular linked list
    struct Node {
        StakeData data;
        uint prev;
        uint next;
    }

    // FIELDS

    // INTERNAL FIELDS
    Node[] internal stakeNodes; // Sorted circular linked list nodes conaining stake data (Built on top https://programtheblockchain.com/posts/2018/03/30/storage-patterns-doubly-linked-list/)

    // PUBLIC FIELDS
    uint public minimumStake;
    uint public numOperators;
    uint public withdrawalDelay;
    mapping (address => bool) public isRanked;
    mapping (address => uint) public latestUnstakeTime;
    mapping (address => uint) public stakeToWithdraw;
    uint public numStakers; // Current number of stakers (Needed because of array holes)

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
        StakeData memory temp = StakeData({ amount: 0, staker: 0x0000000000000000000000000000000000000000 });
        stakeNodes.push(Node(temp, 0, 0));
    }

    // METHODS : STAKING

    function stake(
        uint amount,
        bytes data
    )
        public
        pre_cond(amount >= minimumStake)
    {
        uint tailNodeId = stakeNodes[0].prev;
        // Staking amount is greater than the least amount in the array
        require(amount > stakeNodes[tailNodeId].data.amount || numStakers < numOperators);
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
        emit Unstaked(msg.sender, amount, totalStakedFor(msg.sender), data);
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

    // INTERNAL METHODS

    function insertNodeSorted(uint amount, address staker) internal returns (uint) {
        uint current = stakeNodes[0].next;
        if (current == 0) return insertNodeAfter(0, amount, staker);
        while (isValidNode(current)) {
            if (amount > stakeNodes[current].data.amount) {
                break;
            }
            current = stakeNodes[current].next;
        }
        return insertNodeBefore(current, amount, staker);
    }

    function insertNodeAfter(uint id, uint amount, address staker) internal returns (uint newID) {

        // 0 is allowed here to insert at the beginning.
        require(id == 0 || isValidNode(id));

        Node storage node = stakeNodes[id];

        stakeNodes.push(Node({
            data: StakeData(amount, staker),
            prev: id,
            next: node.next
        }));

        newID = stakeNodes.length - 1;

        stakeNodes[node.next].prev = newID;
        node.next = newID;
        numStakers++;
    }

    function insertNodeBefore(uint id, uint amount, address staker) internal returns (uint) {
        return insertNodeAfter(stakeNodes[id].prev, amount, staker);
    }

    function removeNode(uint id) internal {
        require(isValidNode(id));

        Node storage node = stakeNodes[id];

        stakeNodes[node.next].prev = node.prev;
        stakeNodes[node.prev].next = node.next;

        delete stakeNodes[id];
        numStakers--;
    }

    function updateStakerRanking(address _staker) internal {
        uint newStakedAmount = totalStakedFor(_staker);
        if (newStakedAmount == 0) {
            isRanked[_staker] = false;
            removeStakerFromArray(_staker);
        } else if (isRanked[_staker]) {
            removeStakerFromArray(_staker);
            insertNodeSorted(newStakedAmount, _staker);
        } else {
            isRanked[_staker] = true;
            insertNodeSorted(newStakedAmount, _staker);
        }
    }

    function removeStakerFromArray(address _staker) internal {
        uint id = searchNode(_staker);
        require(id > 0);
        removeNode(id);
    }

    // VIEW FUNCTIONS

    function isValidNode(uint id) view returns (bool) {
        // 0 is a sentinel and therefore invalid.
        // A valid node is the head or has a previous node.
        return id != 0 && (id == stakeNodes[0].next || stakeNodes[id].prev != 0);
    }

    function searchNode(address staker) view returns (uint) {
        uint current = stakeNodes[0].next;
        while (isValidNode(current)) {
            if (staker == stakeNodes[current].data.staker) {
                return current;
            }
            current = stakeNodes[current].next;
        }
        return 0;
    }

    function isOperator(address user) view returns (bool) {
        address[] memory operators = getOperators();
        for (uint i; i < operators.length; i++) {
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
        uint arrLength = (numOperators > numStakers) ?
            numStakers :
            numOperators;
        address[] memory operators = new address[](arrLength);
        uint current = stakeNodes[0].next;
        for (uint i; i < arrLength; i++) {
            operators[i] = stakeNodes[current].data.staker;
            current = stakeNodes[current].next;
        }
        return operators;
    }

    function getStakersAndAmounts()
        view
        returns (address[], uint[])
    {
        address[] memory stakers = new address[](numStakers);
        uint[] memory amounts = new uint[](numStakers);
        uint current = stakeNodes[0].next;
        for (uint i; i < numStakers; i++) {
            stakers[i] = stakeNodes[current].data.staker;
            amounts[i] = stakeNodes[current].data.amount;
            current = stakeNodes[current].next;
        }
        return (stakers, amounts);
    }
}
