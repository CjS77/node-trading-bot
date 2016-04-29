'use strict';
const CoinbaseExchange = require('coinbase-exchange');
const assert = require('assert');

const no_data = {
    updated: undefined,
    data: undefined
};

class TradingBot {
    constructor(options) {
        this.busy_executing = false;
        options = options || {};
        this.log = options.log || console.log;
        this.product = options.product || 'BTC-USD';
        this._timer = null;
        if (!options.client) {
            if (!options.auth) {
                throw new Error('TradingBot: Either a Coinbase client or an auth object must be provided');
            }
            let auth = options.auth;
            this.client = new CoinbaseExchange.AuthenticatedClient(auth.key, auth.secret, auth.passphrase, auth.apiURI);
        }
        else {
            this.client = options.client;
        }
        assert(this.client);
        this.ws_client = null;
        if (options.websocketClient) {
            this.ws_client = options.websocketClient;
        } else if (options.websocketURI) {
            this.ws_client = this.get_default_ws_client(options.websocketURI);
        }
        this.init_state();
    }

    init_state() {
        this._ticker = { updated: undefined, data: undefined, errors: [] };
        this._orderbook = { updated: undefined, data: undefined, errors: [] };
        this._myorders = { updated: undefined, data: undefined, errors: [] };
    }

    get ticker() {
        return this._ticker;
    }

    get price() {
        const info = this._ticker.data;
        if (info) {
            return {
                updated: this._ticker.updated,
                data: info.price,
                errors: info.errors
            }
        }
        return no_data;
    }

    get midmarket_price() {
        const info = this._ticker.data;
        if (info) {
            return {
                updated: this._ticker.updated,
                data: 0.5 * (+info.ask + (+info.bid)),
                errors: info.errors
            }
        }
        return no_data;
    }

    get order_book() {
        return this._orderbook;
    }

    get my_orders() {
        return this._myorders;
    }

    get is_trading() {
        return this._timer !== null;
    }

    /**
     * Starts trading with the bot.
     * @param options
     * @param options.interval the length of time (in ms) between firing the strategy (default: 1000ms)
     * @returns {Promise}
     */
    start_trading(options) {
        const self = this;
        options = options || {};
        return self.stop_trading({ cancel: false }).then(() => {
            const interval = options.interval || 1000;
            self._timer = setInterval(self.execute_strategy.bind(self), interval);
            return Promise.resolve();
        });
    }

    /**
     * Stop the trading bot
     * @param options
     * @param options.cancel {boolean} if true, calls #cancel_all_orders before stopping
     * @returns {Promise}
     */
    stop_trading(options) {
        if (!this.is_trading) {
            return Promise.resolve();
        }
        options = options || { cancel: false };
        const self = this;
        let cancel = options.cancel ? self.cancel_all_orders() : Promise.resolve();
        return cancel.then(() => {
            clearInterval(this._timer);
            this._timer = null;
            return Promise.resolve();
        });
    }

    /**
     * Returns a promise to cancel an order
     * @param order_id {string}
     * @returns {Promise}
     */
    cancel_order(order_id) {
        return new Promise((resolve, reject) => {
            this.client.cancelOrder(order_id, (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
            })
        });
    }

    /**
     * Returns a promise to cancel all orders
     */
    cancel_all_orders() {
        return this.cancel_order(null);
    }

    execute_strategy() {
        const self = this;
        if (self.busy_executing) {
            self.log({ message: 'The last trade execution is still busy. Skipping this round' });
            return;
        }
        self.busy_executing = true;
        setImmediate(() => {
            self._execute_trading_strategy().then(() => {
                this.busy_executing = false;
            });
        });
    }

    /**
     * Sub-classes override this method to enact their trading strategy
     * @private
     * @returns {Promise}
     */
    _execute_trading_strategy() {
        return Promise.resolve();
    }

    get_default_ws_client(wss) {
        this.log({ message: 'Attempting to obtain websocket feed from ' + wss });
        let websocket = new CoinbaseExchange.WebsocketClient(product, wss);
        websocket.on('close', function() {
            setTimeout(function() {
                websocket.connect();
            }, 1000);
        });
        return websocket;
    }

    /**
     * Returns a promise for the latest ticker price. Does not update state
     */
    fetch_ticker() {
        let self = this;
        return new Promise((resolve, reject) => {
            self.client.getProductTicker((err, ticker) => {
                if (err) {
                    return reject(err);
                }
                resolve(ticker);
            })
        });
    }

    /**
     * Returns a promise for the order book. Does not update state
     * @returns {Promise}
     */
    fetch_orderbook() {
        let self = this;
        return new Promise((resolve, reject) => {
            self.client.getProductOrderBook({ level: 2 }, (err, order_book) => {
                if (err) {
                    return reject(err);
                }
                resolve(order_book);
            })
        });
    }

    /**
     * Returns a promise for the order book. Does not update state
     * @returns {Promise}
     */
    fetch_myorders() {
        let self = this;
        return new Promise((resolve, reject) => {
            self.client.getOrders((err, orders) => {
                if (err) {
                    return reject(err);
                }
                resolve(orders);
            })
        });
    }
    
    /**
     * Request all indicators to refresh themselves.
     */
    refresh_indicators() {
        const self = this;

        function update_item(promise, obj) {
            return promise.then(data => {
                obj.updated = new Date();
                obj.data = data;
                return data;
            }).catch(err => {
                obj.errors.push({
                    timestamp: new Date(),
                    error: err
                });
            })
        }

        update_item(self.fetch_ticker(), self._ticker);
        update_item(self.fetch_orderbook(), self._orderbook);
        update_item(self.fetch_myorders(), self._myorders);
    }
}

module.exports = TradingBot;