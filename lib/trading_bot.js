'use strict';
const gdax = require('gdax');
const assert = require('assert');
const continuous = require('continuous');

const no_data = {
    updated: undefined,
    data: undefined
};

class TradingBot {
    /**
     * You should only create instances of subclusses of this class
     * @param options
     * @param options.log {function}
     * @param options.product {string} GDAX product. Required
     * @param options.auth {object} Auth details. Either this or client is required
     * @param options.client {AuthenticatedClient}
     * @param options.websocketURI {string} optional
     */
    constructor(options) {
        this._busy_executing = false;
        this._is_trading = false;
        options = options || {};
        this.log = options.log || console.log;
        this.product = options.product || 'BTC-USD';
        if (!options.client) {
            if (!options.auth) {
                throw new Error('TradingBot: Either a Coinbase client or an auth object must be provided');
            }
            let auth = options.auth;
            this.api_url = auth.apiURI;
            this.client = new gdax.AuthenticatedClient(auth.key, auth.secret, auth.passphrase, auth.apiURI);
        }
        else {
            this.client = options.client;
            this.api_url = this.client.api_url;
        }
        assert(this.client);
        this.websocket_uri = options.websocketURI || 'wss://ws-feed.gdax.com';
        this._orderbookSync = null;
        this._timer = null;
        this.init_state();
    }

    init_state() {
        this._ticker = { updated: undefined, data: undefined, errors: [] };
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
        if (!this._orderbookSync) {
            this._orderbookSync = new gdax.OrderbookSync(this.product, this.api_url, this.websocket_uri, this.client);
        }
        return this._orderbookSync.book.state();
    }

    get my_orders() {
        return this._myorders;
    }

    get is_trading() {
        return this._is_trading;
    }

    /**
     * Starts trading with the bot.
     * @param options
     * @param options.limit: {Number} - optional, default: -1(forever)
     * @param options.time: {Number} - milliseconds between runs (non-random only), default: 1000
     * @param options.minTime: {Number} - min allowed milliseconds between runs (random only), default: 0
     * @param options.maxTime: {Number} - max allowed milliseconds between runs (random only), default: 1000
     * @param options.random: {Boolean} - whether or not it should run randomly between minTime and maxTime, default: false
     * @returns {Promise}
     */
    start_trading(options) {
        let self = this;
        options = options || {};
        options.callback = this._execute_trading_strategy.bind(this);
        return new Promise(resolve => {
            if (self.is_trading) {
                return resolve(false);
            }
            let timer = new continuous(options);
            timer.on('stopped', () => {
                this._is_trading = false;
            });
            this._timer = timer;
            timer.on('started', () => {
                this._is_trading = true;
                return resolve(true);
            });
            timer.start();
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
            this._timer.stop();
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
        return new Promise((resolve, reject) => {
            this.client.cancelAllOrders((err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
            })
        });
    }

    execute_strategy() {
        const self = this;
        if (self._busy_executing) {
            self.log({ message: 'The last trade execution is still busy. Skipping this round' });
            return;
        }
        self._busy_executing = true;
        setImmediate(() => {
            self._execute_trading_strategy().then(() => {
                this._busy_executing = false;
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
        let websocket = new gdax.WebsocketClient(this.product, wss);
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
