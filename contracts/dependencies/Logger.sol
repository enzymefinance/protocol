pragma solidity ^0.4.11;

import './DBC.sol';
import './Permissioned.sol';

contract Logger is DBC, Permissioned {
    // Error logs
    event Error(address thrower, uint errCode, string errMsg);
    function logError (address thrower, uint errCode, string errMsg)
        pre_cond(isPermitted(msg.sender))
    {
        Error(thrower, errCode, errMsg);
    }

    // Vault logs
    event VaultAdded(address sender, address vaultAddress, uint id, string name);
    function logVaultAdded(address vaultAddress, uint id, string name)
        pre_cond(isPermitted(msg.sender))
    {
        VaultAdded(msg.sender, vaultAddress, id, name);
    }

    event SubscribeRequest(address sender, address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    function logSubscribeRequested(address byParticipant, uint256 atTimestamp, uint256 numShares)
        pre_cond(isPermitted(msg.sender))
    {
        SubscribeRequest(msg.sender, byParticipant, atTimestamp, numShares);
    }

    event RedeemRequest(address sender, address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    function logRedeemRequested(address byParticipant, uint256 atTimestamp, uint256 numShares)
        pre_cond(isPermitted(msg.sender))
    {
        RedeemRequest(msg.sender, byParticipant, atTimestamp, numShares);
    }

    event Subscribed(address sender, address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    function logSubscribed(address byParticipant, uint256 atTimestamp, uint256 numShares)
        pre_cond(isPermitted(msg.sender))
    {
        Subscribed(msg.sender, byParticipant, atTimestamp, numShares);
    }

    event Redeemed(address sender, address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    function logRedeemed(address byParticipant, uint256 atTimestamp, uint256 numShares)
        pre_cond(isPermitted(msg.sender))
    {
        Redeemed(msg.sender, byParticipant, atTimestamp, numShares);
    }

    event PortfolioContent(address sender, uint256 assetHoldings, uint256 assetPrice, uint256 assetDecimals);
    function logPortfolioContent(uint256 assetHoldings, uint256 assetPrice, uint256 assetDecimals)
        pre_cond(isPermitted(msg.sender))
    {
        PortfolioContent(msg.sender, assetHoldings, assetPrice, assetDecimals);
    }

    event SpendingApproved(address sender, address ofToken, address onExchange, uint256 amount);
    function logSpendingApproved(address ofToken, address onExchange, uint256 amount)
        pre_cond(isPermitted(msg.sender))
    {
        SpendingApproved(msg.sender, ofToken, onExchange, amount);
    }

    event RewardsConverted(address sender, uint256 atTimestamp, uint256 numSharesConverted, uint256 numUnclaimedRewards);
    function logRewardsConverted(uint256 atTimestamp, uint256 numSharesConverted, uint256 numUnclaimedRewards)
        pre_cond(isPermitted(msg.sender))
    {
        RewardsConverted(msg.sender, atTimestamp, numSharesConverted, numUnclaimedRewards);
    }

    event RewardsPayedOut(address sender, uint256 atTimestamp, uint256 numSharesPayedOut, uint256 atSharePrice);
    function logRewardsPayedOut(uint256 atTimestamp, uint256 numSharesPayedOut, uint256 atSharePrice)
        pre_cond(isPermitted(msg.sender))
    {
        RewardsPayedOut(msg.sender, atTimestamp, numSharesPayedOut, atSharePrice);
    }

    event CalculationUpdate(address sender, uint256 atTimestamp, uint256 managementReward, uint256 performanceReward, uint256 nav, uint256 sharePrice, uint256 totalSupply);
    function logCalculationUpdate(uint256 atTimestamp, uint256 managementReward, uint256 performanceReward, uint256 nav, uint256 sharePrice, uint256 totalSupply)
        pre_cond(isPermitted(msg.sender))
    {
        CalculationUpdate(msg.sender, atTimestamp, managementReward, performanceReward, nav, sharePrice, totalSupply);
    }
}
