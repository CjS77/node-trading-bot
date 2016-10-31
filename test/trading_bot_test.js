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
        // Hijack the internal WS client
        bot._orderbookSync = mocks.mockOrderBook;
        // Must call this since we've short-circuited the internal logic
        bot.listen_to_messages();
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
        expect(bot.last_price).to.be(undefined);
    });

    it('the ticker price is initially undefined', () => {
        expect(bot.ticker.updated).to.be(undefined);
        expect(bot.ticker.data).to.be(undefined);
    });

    it('my orders are initially undefined', () => {
        expect(bot.my_orders.updated).to.be(undefined);
        expect(bot.my_orders.data).to.be(undefined);
    });

    it('provides data after a refresh', () => {
        return bot.refresh_indicators().then(() => {
            expect(bot.ticker.data.ask).to.equal('403.05');
            expect(bot.order_book).to.eql(mocks.mockOrderBook.book.state());
            expect(bot.my_orders.data).to.eql(bot.client.orders);
        });
    });
    
    it('can cancel an order', () => {
        return bot.cancel_order('d50ec984-77a8-460a-b958-66f114b0de9c').then(() => {
            return bot.refresh_indicators().then(() => {
                expect(bot.my_orders.data.length).to.equal(2);
                expect(bot.my_orders.data[0].id).to.equal('d50ec984-77a8-460a-b958-66f114b0de9b');
                expect(bot.my_orders.data[1].id).to.equal('d50ec984-77a8-460a-b958-66f114b0de9d');
            });
        });
    });

    it('can cancel all orders', () => {
        return bot.cancel_all_orders().then(() => {
            return bot.refresh_indicators().then(() => {
                expect(bot.my_orders.data).to.eql([]);
            });
        });
    });

    it('has realtime last_price updates', done => {
        mocks.mockOrderBook.emit('message', {
            type: 'match',
            price: '1.2345'
        });
        setTimeout(() => {
            expect(bot.last_price).to.eql('1.2345');
            done();
        }, 10);
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
    
    it('logs api errors', () => {
        const old_ticker = bot.client.getProductTicker;
        bot.client.getProductTicker = (cb) => { cb(new Error('Could not get ticker')) };
        return bot.refresh_indicators().then(() => {
            expect(bot.ticker.errors.length).to.be(1);
            expect(bot.ticker.errors[0].error.message).to.be('Could not get ticker');
            bot.client.getProductTicker = old_ticker;
        });
    }
    )
});

