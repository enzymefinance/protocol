pragma solidity ^0.4.11;

contract Logger {
    // Error logs
    event Error(address thrower, uint errCode, string errMsg);
    function logError(address thrower, uint errCode, string errMsg) {
        Error(thrower, errCode, errMsg);
    }

    // Vault logs
    event Subscribed(address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    event Redeemed(address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    event PortfolioContent(uint256 assetHoldings, uint256 assetPrice, uint256 assetDecimals); // Calcualtions
    event SpendingApproved(address ofToken, address onExchange, uint256 amount); // Managing
    event RewardsConverted(uint256 atTimestamp, uint256 numSharesConverted, uint256 numunclaimedRewards);
    event RewardsPayedOut(uint256 atTimestamp, uint256 numSharesPayedOut, uint256 atSharePrice);
    event CalculationUpdate(uint256 atTimestamp, uint256 managementReward, uint256 performanceReward, uint256 nav, uint256 sharePrice, uint256 totalSupply);
}
