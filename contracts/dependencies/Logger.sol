pragma solidity ^0.4.11;

contract Logger {
    // Error logs
    event Error(address thrower, uint errCode, string errMsg);
    function logError(address thrower, uint errCode, string errMsg) {
        Error(thrower, errCode, errMsg);
    }

    // Vault logs
    event Subscribed(address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    function logSubscribed(address byParticipant, uint256 atTimestamp, uint256 numShares) {
        Subscribed(byParticipant, atTimestamp, numShares);
    }

    event Redeemed(address indexed byParticipant, uint256 atTimestamp, uint256 numShares);
    function logRedeemed(address byParticipant, uint256 atTimestamp, uint256 numShares) {
        Redeemed(byParticipant, atTimestamp, numShares);
    }

    event PortfolioContent(uint256 assetHoldings, uint256 assetPrice, uint256 assetDecimals);
    function logPortfolioContent(uint256 assetHoldings, uint256 assetPrice, uint256 assetDecimals) {
        PortfolioContent(assetHoldings, assetPrice, assetDecimals);
    }

    event SpendingApproved(address ofToken, address onExchange, uint256 amount);
    function logSpendingApproved(address ofToken, address onExchange, uint256 amount) {
        SpendingApproved(ofToken, onExchange, amount);
    }

    event RewardsConverted(uint256 atTimestamp, uint256 numSharesConverted, uint256 numUnclaimedRewards);
    function logRewardsConverted(uint256 atTimestamp, uint256 numSharesConverted, uint256 numUnclaimedRewards) {
        RewardsConverted(atTimestamp, numSharesConverted, numUnclaimedRewards);
    }

    event RewardsPayedOut(uint256 atTimestamp, uint256 numSharesPayedOut, uint256 atSharePrice);
    function logRewardsPayedOut(uint256 atTimestamp, uint256 numSharesPayedOut, uint256 atSharePrice) {
        RewardsPayedOut(atTimestamp, numSharesPayedOut, atSharePrice);
    }

    event CalculationUpdate(uint256 atTimestamp, uint256 managementReward, uint256 performanceReward, uint256 nav, uint256 sharePrice, uint256 totalSupply);
    function logCalculationUpdate(uint256 atTimestamp, uint256 managementReward, uint256 performanceReward, uint256 nav, uint256 sharePrice, uint256 totalSupply) {
        CalculationUpdate(atTimestamp, managementReward, performanceReward, nav, sharePrice, totalSupply);
    }
}
