pragma solidity 0.6.1;

import "./FeeManager.sol";
import "../hub/Hub.sol";
import "../shares/Shares.sol";
import "../../dependencies/DSMath.sol";

contract ManagementFee is DSMath {

    uint public DIVISOR = 10 ** 18;

    mapping (address => uint) public managementFeeRate;
    mapping (address => uint) public lastPayoutTime;

    function feeAmount() external view returns (uint feeInShares) {
        Hub hub = FeeManager(msg.sender).hub();
        Shares shares = Shares(hub.shares());
        if (shares.totalSupply() == 0 || managementFeeRate[msg.sender] == 0) {
            feeInShares = 0;
        } else {
            uint timePassed = sub(block.timestamp, lastPayoutTime[msg.sender]);
            uint preDilutionFeeShares = mul(mul(shares.totalSupply(), managementFeeRate[msg.sender]) / DIVISOR, timePassed) / 365 days;
            feeInShares =
                mul(preDilutionFeeShares, shares.totalSupply()) /
                sub(shares.totalSupply(), preDilutionFeeShares);
        }
        return feeInShares;
    }

    function initializeForUser(uint feeRate, uint feePeriod, address denominationAsset) external {
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

