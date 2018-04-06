pragma solidity ^0.4.18;

import "ds-math/math.sol";
import "../dependencies/Owned.sol";
import "../assets/AssetInterface.sol";
import "./StakingInterface.sol";

/// @notice Modified from StakeBank by Harbor Project (https://git.io/vxy8z)
contract StakeBank is StakingInterface, DSMath, Owned {

    struct Checkpoint {
        uint256 at;
        uint256 amount;
    }

    AssetInterface public stakingToken;

    Checkpoint[] public stakeHistory;

    mapping (address => Checkpoint[]) public stakesFor;

    /// @param _token Token that can be staked.
    function StakeBank(AssetInterface _token) public {
        require(address(_token) != 0x0);
        stakingToken = _token;
    }

    /// @notice Stakes a certain amount of tokens.
    /// @param amount Amount of tokens to stake.
    /// @param data Data field used for signalling in more complex staking applications.
    function stake(uint256 amount, bytes data) public {
        stakeFor(msg.sender, amount, data);
    }

    /// @notice Stakes a certain amount of tokens for another user.
    /// @param user Address of the user to stake for.
    /// @param amount Amount of tokens to stake.
    /// @param data Data field used for signalling in more complex staking applications.
    function stakeFor(address user, uint256 amount, bytes data) public {
        updateCheckpointAtNow(stakesFor[user], amount, false);
        updateCheckpointAtNow(stakeHistory, amount, false);

        require(stakingToken.transferFrom(msg.sender, address(this), amount));

        Staked(user, amount, totalStakedFor(user), data);
    }

    /// @notice Unstakes a certain amount of tokens.
    /// @param amount Amount of tokens to unstake.
    /// @param data Data field used for signalling in more complex staking applications.
    function unstake(uint256 amount, bytes data) public {
        require(totalStakedFor(msg.sender) >= amount);

        updateCheckpointAtNow(stakesFor[msg.sender], amount, true);
        updateCheckpointAtNow(stakeHistory, amount, true);

        require(stakingToken.transfer(msg.sender, amount));
        Unstaked(msg.sender, amount, totalStakedFor(msg.sender), data);
    }

    /// @notice Returns total tokens staked for address.
    /// @param addr Address to check.
    /// @return amount of tokens staked.
    function totalStakedFor(address addr) public view returns (uint256) {
        Checkpoint[] storage stakes = stakesFor[addr];

        if (stakes.length == 0) {
            return 0;
        }

        return stakes[stakes.length-1].amount;
    }

    /// @notice Returns total tokens staked.
    /// @return amount of tokens staked.
    function totalStaked() public view returns (uint256) {
        return totalStakedAt(block.number);
    }

    /// @notice Returns if history related functions are implemented.
    /// @return Bool whether history is implemented.
    function supportsHistory() public pure returns (bool) {
        return true;
    }
    
    /// @notice Returns the token address.
    /// @return Address of token.
    function token() public view returns (address) {
        return stakingToken;
    }

    /// @notice Returns last block address staked at.
    /// @param addr Address to check.
    /// @return block number of last stake.
    function lastStakedFor(address addr) public view returns (uint256) {
        Checkpoint[] storage stakes = stakesFor[addr];

        if (stakes.length == 0) {
            return 0;
        }

        return stakes[stakes.length-1].at;
    }

    /// @notice Returns total amount of tokens staked at block for address.
    /// @param addr Address to check.
    /// @param blockNumber Block number to check.
    /// @return amount of tokens staked.
    function totalStakedForAt(address addr, uint256 blockNumber) public view returns (uint256) {
        return stakedAt(stakesFor[addr], blockNumber);
    }

    /// @notice Returns the total tokens staked at block.
    /// @param blockNumber Block number to check.
    /// @return amount of tokens staked.
    function totalStakedAt(uint256 blockNumber) public view returns (uint256) {
        return stakedAt(stakeHistory, blockNumber);
    }

    function updateCheckpointAtNow(Checkpoint[] storage history, uint256 amount, bool isUnstake) internal {

        uint256 length = history.length;
        if (length == 0) {
            history.push(Checkpoint({at: block.number, amount: amount}));
            return;
        }

        if (history[length-1].at < block.number) {
            history.push(Checkpoint({at: block.number, amount: history[length-1].amount}));
        }

        Checkpoint storage checkpoint = history[length];

        if (isUnstake) {
            checkpoint.amount = sub(checkpoint.amount, amount);
        } else {
            checkpoint.amount = add(checkpoint.amount, amount);
        }
    }

    function stakedAt(Checkpoint[] storage history, uint256 blockNumber) internal view returns (uint256) {
        uint256 length = history.length;

        if (length == 0 || blockNumber < history[0].at) {
            return 0;
        }

        if (blockNumber >= history[length-1].at) {
            return history[length-1].amount;
        }

        uint min = 0;
        uint max = length-1;
        while (max > min) {
            uint mid = (max + min + 1) / 2;
            if (history[mid].at <= blockNumber) {
                min = mid;
            } else {
                max = mid-1;
            }
        }

        return history[min].amount;
    }
}
