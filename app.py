from flask import Flask, jsonify, render_template
from flask_cors import CORS
import ccxt


app = Flask(__name__)
CORS(app)

exchange = ccxt.btcturk({"enableRateLimit": True, "timeout": 15_000})
price_memory = {}


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/status")
def status():
    return jsonify({"status": "online", "exchange": "BtcTurk", "version": "1.1"})


@app.route("/api/veri")
def market_data():
    """Return TRY pairs with the change since the previous dashboard refresh."""
    try:
        tickers = exchange.fetch_tickers()
        coins = []

        for symbol, ticker in tickers.items():
            if not symbol.endswith("/TRY"):
                continue

            price = ticker.get("last")
            if price is None:
                continue

            price = float(price)
            previous = price_memory.get(symbol, price)
            change = 0 if previous == 0 else ((price - previous) / previous) * 100
            price_memory[symbol] = price

            coins.append({
                "symbol": symbol,
                "price": price,
                "formatted_price": f"{price:,.2f} ₺",
                "change": round(change, 2),
            })

        gainers = sorted(coins, key=lambda coin: coin["change"], reverse=True)
        losers = sorted(coins, key=lambda coin: coin["change"])

        return jsonify({
            "status": "success",
            "gainers": gainers[:10],
            "losers": losers[:10],
            "count": len(coins),
        })
    except Exception:
        app.logger.exception("BtcTurk market data could not be fetched")
        return jsonify({
            "status": "error", "message": "Piyasa verisi şu anda alınamadı."}), 503


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"status": "error", "message": "Sayfa bulunamadı."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000, debug=False)
