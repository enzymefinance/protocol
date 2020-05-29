pragma solidity 0.6.8;

import "../../dependencies/DSMath.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";

/// @title ManagementFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the management fee for a particular fund
contract ManagementFee is DSMath {

    uint public DIVISOR = 10 ** 18;

    mapping (address => uint) public managementFeeRate;
    mapping (address => uint) public lastPayoutTime;

    function feeAmount() external returns (uint feeInShares) {
        Shares shares = Shares(IHub(ISpoke(msg.sender).HUB()).shares());
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

