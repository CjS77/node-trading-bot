'use strict';
const expect = require('expect.js');
const TradingBot = require('../lib/trading_bot');
const mocks = require('./mocks');

describe('The TradingBot class', () => {
    var bot;

    beforeEach(() => {
        let options = {
            client: new mocks.AuthenticatedClient()
        };
        bot = new TradingBot(options);
        bot._orderbookSync = mocks.mockOrderBook;
    });

    it('can be constructed', () => {
        expect(bot instanceof TradingBot).to.be(true);
    });
    
    it('requires an exchange client', () => {
        expect(() => new TradingBot()).to.throwError();
    });
    

    it('starts off not trading', () => {
        expect(bot.is_trading).to.equal(false);
    });

    it('sets the is_trading flag', () => {
        return bot.start_trading().then(() => {
            expect(bot.is_trading).to.be(true);
            return bot.stop_trading();
        }).then(() => {
            expect(bot.is_trading).to.be(false);
        });
    });

    it('the ticker is initially undefined', () => {
        expect(bot.ticker.updated).to.be(undefined);
        expect(bot.ticker.data).to.be(undefined);
    });

    it('the price is initially undefined', () => {
        expect(bot.price.updated).to.be(undefined);
        expect(bot.price.data).to.be(undefined);
    });

    it('the ticker is initially undefined', () => {
        expect(bot.midmarket_price.updated).to.be(undefined);
        expect(bot.midmarket_price.data).to.be(undefined);
    });

    it('the ticker price is initially undefined', () => {
        expect(bot.ticker.updated).to.be(undefined);
        expect(bot.ticker.data).to.be(undefined);
    });

    it('my orders are initially undefined', () => {
        expect(bot.my_orders.updated).to.be(undefined);
        expect(bot.my_orders.data).to.be(undefined);
    });

    it('provides data after a refresh', (done) => {
        bot.refresh_indicators();
        setTimeout(() => {
            expect(bot.ticker.data.ask).to.equal('403.05');
            expect(bot.price.data).to.equal('402.50');
            expect(bot.order_book).to.eql(mocks.mockOrderBook.book.state());
            expect(bot.my_orders.data).to.eql(bot.client.orders);
            expect(bot.midmarket_price.data).to.equal(402.55);
            done();
        }, 50);
    });
    
    it('can cancel an order', (done) => {
        bot.cancel_order('d50ec984-77a8-460a-b958-66f114b0de9c').then(() => {
            bot.refresh_indicators();
            setTimeout(() => {
                expect(bot.my_orders.data.length).to.equal(2);
                expect(bot.my_orders.data[0].id).to.equal('d50ec984-77a8-460a-b958-66f114b0de9b');
                expect(bot.my_orders.data[1].id).to.equal('d50ec984-77a8-460a-b958-66f114b0de9d');
                done();
            }, 50);
        });
    });

    it('can cancel all orders', (done) => {
        bot.cancel_all_orders().then(() => {
            bot.refresh_indicators();
            setTimeout(() => {
                expect(bot.my_orders.data).to.eql([]);
                console.log('All orders deleted');
                done();
            }, 50);
        });
    });
});

describe('A simple bot', () => {
    class SimpleBot extends TradingBot {
        constructor() {
            super({
                client: new mocks.AuthenticatedClient()
            });
            this.count = 0;
        }

        _execute_trading_strategy() {
            this.count++;
            return Promise.resolve();
        }
    }

    var bot;
    beforeEach(() => {
        bot = new SimpleBot();
        bot._orderbookSync = mocks.mockOrderBook;
    });
    it('can be subclassed from TradingBot', () => {
        expect(bot instanceof SimpleBot).to.be(true);
        expect(bot instanceof TradingBot).to.be(true);
    });

    it('executes execution script', (done) => {
        setTimeout(() => {
            console.log('Got here too', bot.count);
            expect(bot.count).to.be.greaterThan(1);
            done();
        }, 20);
        bot.start_trading({ time: 5 }).then(() => {
            console.log('Got here');
            expect(bot.is_trading).to.be(true);
            expect(bot.count).to.be(0);
        });
    });
    
    it('logs api errors', (done) => {
        const old_ticker = bot.client.getProductTicker;
        bot.client.getProductTicker = (cb) => { cb('Could not get ticker') };
        bot.refresh_indicators();
        setTimeout(() => {
            expect(bot.ticker.errors.length).to.be(1);
            expect(bot.ticker.errors[0].error).to.be('Could not get ticker');
            bot.client.getProductTicker = old_ticker;
            done();
        }, 20)
    }
    )
});

