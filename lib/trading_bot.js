'use strict';
const gdax = require('gdax');
const assert = require('assert');
const continuous = require('continuous');

class TradingBot {
    /**
     * You should only create instances of subclasses of this class
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
        this.websocket_url = options.websocketURI || 'wss://ws-feed.gdax.com';
        this._orderbookSync = null;
        this._timer = null;
        this.init_state();
    }

    init_state() {
        this._ticker = { updated: undefined, data: undefined, errors: [] };
        this._myorders = { updated: undefined, data: undefined, errors: [] };
    }

    get synced_book() {
        if (!this._orderbookSync) {
            this._orderbookSync = new gdax.OrderbookSync(this.product, this.api_url, this.websocket_url, this.client);
            this.listen_to_messages();
        }
        return this._orderbookSync.book;
    }

    get ticker() {
        return this._ticker;
    }

    get last_price() {
        return this._last_price;
    }

    get midmarket_price() {
        const book = this.synced_book;
        let bid = book._bids.max();
        let ask = book._asks.min();
        if (bid && ask) {
            return 0.5*(+bid.price + +ask.price);
        }
        else {
            return null;
        }
    }

    get order_book() {
        if (!this._orderbookSync) {
            this._orderbookSync = new gdax.OrderbookSync(this.product, this.api_url, this.websocket_url, this.client);
        }
        return this._orderbookSync.book.state();
    }

    get my_orders() {
        return this._myorders;
    }

    get is_trading() {
        return this._is_trading;
    }

    get last_update() {
        return this._stats && this._stats.last_update;
    }

    listen_to_messages() {
        let feed = this._orderbookSync;
        if (!feed) {
            return;
        }
        feed.on('message', msg => {
            this._stats = {
                updated: new Date(),
                last_msg: msg
            };
            switch (msg.type) {
                case 'match':
                    this._last_price = msg.price;
                    return;
            }
        });
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

    /**
     * Returns a promise for the latest ticker price. Does not update state
     */
    fetch_ticker() {
        let self = this;
        return new Promise(resolve => {
            self.client.getProductTicker((err, ticker) => {
                if (err) {
                    self._ticker.errors.push({
                        timestamp: new Date(),
                        error: err
                    });
                    return resolve(null);
                }
                self._ticker.updated = new Date();
                self._ticker.data = ticker;
                resolve(ticker);
            })
        });
    }

    /**
     * Returns a promise for the order book. Updates the state
     * @returns {Promise}
     */
    fetch_myorders() {
        let self = this;
        return new Promise(resolve => {
            self.client.getOrders((err, orders) => {
                if (err) {
                    self._myorders.errors.push({
                        timestamp: new Date(),
                        error: err
                    });
                    return resolve(null);
                }
                self._myorders.updated = new Date();
                self._myorders.data = orders;
                resolve(orders);
            })
        });
    }
    
    /**
     * Request all indicators to refresh themselves. Returns a Promise
     */
    refresh_indicators() {
        return Promise.all([
            this.fetch_ticker(),
            this.fetch_myorders()
        ]);
    }
}

module.exports = TradingBot;
