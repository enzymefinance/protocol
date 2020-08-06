// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";

/// @title ManagementFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the management fee for a particular fund
contract ManagementFee {
    using SafeMath for uint256;

    uint public DIVISOR = 10 ** 18;

    mapping (address => uint) public managementFeeRate;
    mapping (address => uint) public lastPayoutTime;

    function feeAmount() external view returns (uint feeInShares) {
        Shares shares = Shares(IHub(ISpoke(msg.sender).HUB()).shares());
        if (shares.totalSupply() == 0 || managementFeeRate[msg.sender] == 0) {
            feeInShares = 0;
        } else {
            uint timePassed = block.timestamp.sub(lastPayoutTime[msg.sender]);
            uint preDilutionFeeShares = shares.totalSupply().mul(managementFeeRate[msg.sender]).mul(timePassed).div(DIVISOR).div(365 days);
            feeInShares = preDilutionFeeShares.mul(shares.totalSupply()).div(shares.totalSupply().sub(preDilutionFeeShares));
        }
        return feeInShares;
    }

    function initializeForUser(uint feeRate, uint, address) external {
        require(lastPayoutTime[msg.sender] == 0);
        managementFeeRate[msg.sender] = feeRate;
        lastPayoutTime[msg.sender] = block.timestamp;
    }

    function updateState() external {
        lastPayoutTime[msg.sender] = block.timestamp;
    }

    function identifier() external pure returns (uint) {
        return 0;
    }
}
