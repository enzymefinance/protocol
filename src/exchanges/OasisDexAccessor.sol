pragma solidity 0.6.1;

import "./interfaces/IOasisDex.sol";

contract OasisDexAccessor {
    function getUnsortedOfferIds(
        address targetExchange,
        address sellAsset,
        address buyAsset
    )
    public
    view
    returns (uint[] memory)
    {
        IOasisDex market = IOasisDex(targetExchange);
        uint[] memory ids = new uint[](1000);
        uint count = 0;

        // Iterate over all unsorted offers up to 1000 iterations.
        uint id = market.getFirstUnsortedOffer();
        for (uint i = 0; i < 1000; i++) {
            if (id == 0) {
                break;
            }

            if (market.isActive(id)) {
                address sellGem;
                address buyGem;
                (, sellGem, , buyGem) = market.getOffer(id);

                if (sellGem == sellAsset && buyGem == buyAsset) {
                    ids[count++] = id;
                }
            }

            // Get the next offer and repeat.
            id = market.getNextUnsortedOffer(id);
        }

        // Create a new array of offers with the correct size.
        uint[] memory copy = new uint[](count);
        for (uint i = 0; i < count; i++) {
            copy[i] = ids[i];
        }

        return copy;
    }

    function getSortedOfferIds(
        address targetExchange,
        address sellAsset,
        address buyAsset
    )
    public
    view
    returns(uint[] memory)
    {
        IOasisDex market = IOasisDex(targetExchange);
        uint[] memory ids = new uint[](1000);
        uint count = 0;

        // Iterate over all sorted offers.
        uint id = market.getBestOffer(sellAsset, buyAsset);
        for (uint i = 0; i < 1000 ; i++ ) {
            if (id == 0) {
                break;
            }

            if (market.isActive(id)) {
                ids[count++] = id;
            }

            // Get the next offer and repeat.
            id = market.getWorseOffer(id);
        }

        // Create a new array of offers with the correct size.
        uint[] memory copy = new uint[](count);
        for (uint i = 0; i < count; i++) {
            copy[i] = ids[i];
        }

        return copy;
    }

    function getOrders(
        address targetExchange,
        address sellAsset,
        address buyAsset
    )
    public
    view
    returns (uint[] memory, uint[] memory, uint[] memory) {
        IOasisDex market = IOasisDex(targetExchange);
        uint[] memory sIds = getSortedOfferIds(targetExchange, sellAsset, buyAsset);
        uint[] memory uIds = getUnsortedOfferIds(targetExchange, sellAsset, buyAsset);
        uint[] memory ids = new uint[](uIds.length + sIds.length);
        uint[] memory sellQtys = new uint[](ids.length);
        uint[] memory buyQtys = new uint[](ids.length);

        for (uint i = 0; i < sIds.length; i++) {
            ids[i] = sIds[i];
        }

        for (uint i = 0; i < uIds.length; i++) {
            ids[i + sIds.length] = uIds[i];
        }

        for (uint i = 0; i < ids.length; i++) {
            uint sellQty;
            uint buyQty;
            (sellQty, , buyQty,) = market.getOffer(ids[i]);
            sellQtys[i] = sellQty;
            buyQtys[i] = buyQty;
        }

        return (ids, sellQtys, buyQtys);
    }
}
