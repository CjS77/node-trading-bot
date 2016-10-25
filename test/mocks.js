'use strict';

var mockOrderBook = {
    state: function() {
        return {
            sequence: '3',
            'bids': [
                ['402.05', '1', 2],
                ['402.00', '2', 1],
                ['401.00', '1', 2],
                ['400.00', '5', 3],
                ['398.00', '1', 1]
            ],
            'asks': [
                ['403.05', '1', 1],
                ['404.00', '2', 2],
                ['406.00', '3', 3],
                ['406.00', '3', 6],
                ['410.00', '5', 5],
            ]
        };
    }
};

class MockAuthenticatedClient {
    constructor() {
        this.orders = [
            {
                "id": "d50ec984-77a8-460a-b958-66f114b0de9b",
                "size": "0.5",
                "price": "400.00",
                "product_id": "BTC-USD",
                "status": "open",
                "filled_size": "0.00",
                "fill_fees": "0.001",
                "settled": false,
                "side": "buy",
                "created_at": "2014-11-14T06:39:55.000000Z"
            },
            {
                "id": "d50ec984-77a8-460a-b958-66f114b0de9c",
                "size": "0.8",
                "price": "401.00",
                "product_id": "BTC-USD",
                "status": "open",
                "filled_size": "0.00",
                "fill_fees": "0.001",
                "settled": false,
                "side": "buy",
                "created_at": "2014-11-14T06:39:56.000000Z"
            },
            {
                "id": "d50ec984-77a8-460a-b958-66f114b0de9d",
                "size": "1",
                "price": "410.00",
                "product_id": "BTC-USD",
                "status": "open",
                "filled_size": "0.00",
                "fill_fees": "0.001",
                "settled": false,
                "side": "sell",
                "created_at": "2014-11-14T06:39:57.000000Z"
            }
        ]
    }

    getOrders() {
        return this.orders;
    }

    cancelOrder(id, cb) {
        if (id == null) {
            this.orders = [];
            return cb(null, true);
        }
        var order = null;
        for (let i = 0; i < this.orders.length; i++) {
            order = this.orders[i];
            if (order.id === id) {
                this.orders.splice(i, 1)
                break;
            }
        }
        cb(null, order ? id : null);
    }

    cancelAllOrders(cb) {
        this.orders = [];
        return cb(null, true);
    }

    getProductTicker(cb) {
        cb(null, {
            "trade_id": 0,
            "price": "402.50",
            "size": "0.5",
            "bid": "402.05",
            "ask": "403.05",
            "volume": "5957.11914015",
            "time": "2015-11-14T20:46:03.511254Z"
        })
    }

    getProductOrderBook(options, product, cb) {
        if (typeof product === 'function') {
            cb = product;
            product = options;
        }
        cb(null, mockOrderBook);
    }

    getOrders(cb) {
        cb(null, this.orders);
    }
}

class MockWebsocketClient {

}

module.exports = {
    AuthenticatedClient: MockAuthenticatedClient,
    WebsocketClient: MockWebsocketClient,
    mockOrderBook: { book: mockOrderBook }
};
