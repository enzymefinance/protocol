pragma solidity ^0.4.21;


import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../accounting/Accounting.sol";
import "../vault/Vault.sol";
import "../../dependencies/token/ERC20.i.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../prices/CanonicalPriceFeed.sol";
import "../../../engine/AmguConsumer.sol";

/// @notice Entry and exit point for investors
contract Participation is DSMath, AmguConsumer, Spoke {

    event RequestExecuted (
        address investmentAsset,
        uint investmentAmount,
        uint requestedShares,
        uint timestamp,
        uint atUpdateId
    );

    event SuccessfulRedemption (
        uint quantity
    );

    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
        uint atUpdateId;
    }

    mapping (address => Request) public requests;
    uint public SHARES_DECIMALS;

    constructor(address _hub) Spoke(_hub) {}

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    )
        external
        amguPayable
        // TODO: implement and use below modifiers
        // pre_cond(compliance.isInvestmentPermitted(msg.sender, giveQuantity, shareQuantity))    // Compliance Module: Investment permitted
    {
        require(!hub.isShutDown(), "Cannot invest in shut down fund");
        requests[msg.sender] = Request({
            investmentAsset: investmentAsset,
            investmentAmount: investmentAmount,
            requestedShares: requestedShares,
            timestamp: block.timestamp,
            atUpdateId: CanonicalPriceFeed(routes.priceSource).updateId() // TODO: can this be abstracted away?
        });
        SHARES_DECIMALS = 18;
    }

    function cancelRequest() external {
        delete requests[msg.sender];
    }

    function executeRequest() public {
        executeRequestFor(msg.sender);
    }

    function executeRequestFor(address requestOwner)
        public
        amguPayable
        // TODO: implement and use below modifiers
        // pre_cond(
        //     Shares(routes.shares).totalSupply() == 0 ||
        //     (
        //         now >= add(requests[id].timestamp, priceSource.getInterval()) &&
        //         priceSource.updateId() >= add(requests[id].atUpdateId, 2)
        //     )
        // )
    {
        require(!hub.isShutDown(), "Hub must not be shut down");
        PolicyManager(routes.policyManager).preValidate(bytes4(sha3("executeRequestFor(address)")), [requestOwner, address(0), address(0), address(0), address(0)], [uint(0), uint(0), uint(0)], "0x0");
        Request memory request = requests[requestOwner];
        require(request.requestedShares > 0, "Trying to redeem zero shares");
        bool isRecent;
        (isRecent, , ) = CanonicalPriceFeed(routes.priceSource).getPriceInfo(address(request.investmentAsset));
        require(isRecent, "Price not recent");

        FeeManager(routes.feeManager).rewardManagementFee();

        // sharePrice quoted in QUOTE_ASSET and multiplied by 10 ** fundDecimals
        uint costQuantity; // TODO: better naming after refactor (this variable is how much the shares wanted cost in total, in the desired payment token)
        costQuantity = mul(request.requestedShares, Accounting(routes.accounting).calcSharePrice()) / 10 ** SHARES_DECIMALS;
        // TODO: maybe allocate fees in a separate step (to come later)
        if(request.investmentAsset != address(Accounting(routes.accounting).QUOTE_ASSET())) {
            bool isPriceRecent;
            uint invertedInvestmentAssetPrice;
            uint investmentAssetDecimal;
            (isPriceRecent, invertedInvestmentAssetPrice, investmentAssetDecimal) = CanonicalPriceFeed(routes.priceSource).getInvertedPriceInfo(request.investmentAsset);
            // TODO: is below check needed, given the recency check a few lines above?
            require(isPriceRecent, "Investment asset price not recent");
            costQuantity = mul(costQuantity, invertedInvestmentAssetPrice) / 10 ** investmentAssetDecimal;
        }

        // TODO: re-enable
        // require(
        //     isInvestAllowed[request.investmentAsset],
        //     "Investment not allowed in this asset"
        // );
        require(
            costQuantity <= request.investmentAmount,
            "Invested amount too low"
        );

        delete requests[requestOwner];
        require(
            ERC20(request.investmentAsset).transferFrom(
                requestOwner, address(routes.vault), costQuantity
            ),
            "Failed to transfer investment asset to vault"
        );
        Shares(routes.shares).createFor(requestOwner, request.requestedShares);
        // // TODO: this should be done somewhere else
        if (!Accounting(routes.accounting).isInAssetList(request.investmentAsset)) {
            Accounting(routes.accounting).addAssetToOwnedAssets(request.investmentAsset);
        }
        emit RequestExecuted(request.investmentAsset, request.investmentAmount, request.requestedShares, request.timestamp, request.atUpdateId);
    }

    /// @dev "Happy path" (no asset throws & quantity available)
    /// @notice Redeem all shares and across all assets
    function redeem() public {
        uint ownedShares = Shares(routes.shares).balanceOf(msg.sender);
        redeemQuantity(ownedShares);
    }

    /// @notice Redeem shareQuantity across all assets
    function redeemQuantity(uint shareQuantity) public {
        address[] memory assetList;
        (, assetList) = Accounting(routes.accounting).getFundHoldings();
        redeemWithConstraints(shareQuantity, assetList); //TODO: assetList from another module
    }

    function getOwedPerformanceFees(uint shareQuantity)
        view
        returns (uint remainingShareQuantity)
    {
        Shares shares = Shares(routes.shares);
        uint performanceFeePortion = mul(
            FeeManager(routes.feeManager).performanceFeeAmount(),
            shareQuantity
        ) / shares.totalSupply();
        return performanceFeePortion;
    }

    // NB1: reconsider the scenario where the user has enough funds to force shutdown on a large trade (any way around this?)
    // TODO: readjust with calls and changed variable names where needed
    /// @dev Redeem only selected assets (used only when an asset throws)
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public {
        Shares shares = Shares(routes.shares);
        require(
            shares.balanceOf(msg.sender) >= shareQuantity,
            "Sender does not enough shares to fulfill request"
        );

        FeeManager(routes.feeManager).rewardManagementFee();
        uint owedPerformanceFees = getOwedPerformanceFees(shareQuantity);
        shares.destroyFor(msg.sender, owedPerformanceFees);
        shares.createFor(hub.manager(), owedPerformanceFees);
        uint remainingShareQuantity = sub(shareQuantity, owedPerformanceFees);

        address ofAsset;
        uint[] memory ownershipQuantities = new uint[](requestedAssets.length);
        address[] memory redeemedAssets = new address[](requestedAssets.length);
        // Check whether enough assets held by fund
        Accounting accounting = Accounting(routes.accounting);
        for (uint i = 0; i < requestedAssets.length; ++i) {
            ofAsset = requestedAssets[i];
            if (ofAsset == address(0)) continue;
            require(
                accounting.isInAssetList(ofAsset),
                "Requested asset not in asset list"
            );
            for (uint j = 0; j < redeemedAssets.length; j++) {
                require(
                    ofAsset != redeemedAssets[j],
                    "Asset can only be redeemed once"
                );
            }
            redeemedAssets[i] = ofAsset;
            uint quantityHeld = accounting.assetHoldings(ofAsset);
            if (quantityHeld == 0) continue;

            // participant's ownership percentage of asset holdings
            ownershipQuantities[i] = mul(quantityHeld, remainingShareQuantity) / shares.totalSupply();
        }

        shares.destroyFor(msg.sender, remainingShareQuantity);

        // Transfer owned assets
        for (uint k = 0; k < requestedAssets.length; ++k) {
            ofAsset = requestedAssets[k];
            if (ownershipQuantities[k] == 0) {
                continue;
            } else {
                Vault(routes.vault).withdraw(ofAsset, ownershipQuantities[k]);
                require(
                    ERC20(ofAsset).transfer(msg.sender, ownershipQuantities[k]),
                    "Asset transfer failed"
                );
            }
        }
        emit SuccessfulRedemption(remainingShareQuantity);
    }
}

contract ParticipationFactory is Factory {
    function createInstance(address _hub) public returns (address) {
        address participation = new Participation(_hub);
        childExists[participation] = true;
        return participation;
    }
}

