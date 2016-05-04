# Trading bot helper for Coinbase exchanges

This package provides a base from which to easily write automated trading bots on Coinbase's exchanges.
The bots can be run on the Sandbox (with play money, for testing) and with real money, using your API keys.

# Installation

    npm install --save trading_bot

# Usage

Extend the base `Trading Bot` class and implement the `_execute_trading_strategy` method. Trade data data is available
to the method in the object instance (i.e. the `this` variable). Each variable has the following form

    trade_data : {
      updated : {Date},
      data    : {Object | Array | Primitive }
      errors  : {Array of Error objects}
    }

The `updated` field is a timestamp indicating when the data in the `data` field was obtained. The `errors` field, if
present, lists any errors coming from the API (e.g. connection lost)

The following trade data are available as properties:

* `ticker` - the ticker object (bid, ask, price, volume) for the selected product
* `price` - the last trade price for the selected product
* `midmarket_price` - the current midpoint between the highest bid and lowest ask
* `orderbook` - The Level 2 (i.e. aggregated on price) order book for the selected product
* `myorders` - Your orders (all orders are included)

The constructor for the base class takes the following options:

* `product` - The order book to use. Defaults to 'BTC-USD'.
* `log` - An optional logging utility. Defaults to `console.log`
* `auth` - An object containing your API key credentials. See the example below.
* `client` - Instead of `auth`, a valid `AuthenticatedClient` instance can be provided instead.
* `webSocketURI` - Optional. If provided, creates a connection to the given WS server.
* `websocketClient` - If provided, is available as `this.ws_client`

The following utility methods are also available

* `start_trading(options)` - Start executing the trading strategy. The `options` parameter may contain the following:
   * interval: the frequency (in ms) with which to try and execute the strategy. If the result of the last execution has
     not been received yet, the strategy will not fire.
* `stop_trading(options)` - Pause the strategy execution. If `options.cancel` is true, all existing orders will be cancelled
* `cancel_order(id)` - place a cancel order instruction on the exchange for order with `id`
* `cancel_all_orders()` - place a "cancel all orders" instruction on the exchange
* `refresh_indicators()` - place requests to update all the trade data. This call should be made manually when you
want the latest set of trade data. The function returns immediately, and the data
will be updated when the data arrives. As of this version of the code, no notifications are given when this happens

## Writing the strategy method

The `_execute_trading_strategy` method must return a Promise that resolves when the trade is "done". You can decide what
this means, but the method will not fire again until the promise has resolved.

The `client` property of the super class is an [`AuthenticatedClient` instance of the Coinbase exchange API for node.js](https://github.com/coinbase/coinbase-node)
which you can use to make trades, or do whatever you want. You might also find the
[API docs](https://docs.exchange.coinbase.com/#api) useful.

# Example

Here is a simple example of a very loss-making bot that executes random trades on the exchange. *This is an example. Do not
run this bot as it is, since it will lose a lot of money very quickly!*

```javascript
'use strict';
const TradingBot = require('trading_bot');

class RandomBot extends TradingBot {
    constructor() {
        let auth = {
            key: xxx,
            secret: xxxxxxxx,
            passphrase: xxxxxxx,
            apiURI: 'https://api-public.sandbox.exchange.coinbase.com'
        };
        super({ auth: auth });
    }

    _execute_trading_strategy() {
        return new Promise((resolve, reject) => {
            const self = this;
            let side = (self.trades % 2 === 0) ? 'buy' : 'sell';
            let size = 0.1 + 0.9 * Math.random();
            size = size.toFixed(2);
            var order = {
                product_id: self.product,
                type: 'market',
                size: size
            };
            self.client[side](order, (err, res, body) => {
                if (err) {
                    console.log('Errror placing trade');
                    return reject(err);
                }
                console.log(body);
                resolve();
            });
        });
    }
}

const bot = new RandomBot();
console.log('RandomBot is starting to lose money again');
bot.start_trading({ interval: 1000 });
```

# Disclaimer

You could lose money by using this software! Do not trade with this bot if you don't understand the risks or are unwilling
to potentially suffer significant financial loss. Neither the Author of this code, nor Coinbase Inc. will be liable for
 any or all losses sustained through the direct or indirect use of this software or derivative works.

THIS SOFTWARE IS PROVIDED "AS IS" AND ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.

IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.