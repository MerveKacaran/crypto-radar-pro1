"""Crypto Radar backend.

Bu uygulama BtcTurk'ten yalnızca piyasa verisi okur. Alım ve satım
işlemleri arayüz tarafında sanal portföy olarak tutulacaktır; bu dosya
gerçek emir göndermez ve API anahtarı kullanmaz.
"""

from __future__ import annotations

import time
from typing import Any

import ccxt
from flask import Flask, jsonify, render_template


app = Flask(__name__)

# BtcTurk bağlantısında emir oluşturma yetkisi yoktur; sadece herkese açık
# piyasa uç noktaları kullanılır.
exchange = ccxt.btcturk({
    "enableRateLimit": True,
    "timeout": 15_000,
})

CACHE_SECONDS = 10
MARKET_LIMIT = 7
_market_cache: dict[str, Any] = {"created_at": 0.0, "data": None}


@app.get("/")
def home():
    """Ana ekranı göster."""
    return render_template("index.html")


def signal_for(change: float) -> tuple[str, str, bool]:
    """24 saatlik değişime göre gösterim sinyali üret.

    Dönen değerler: görünen metin, CSS sınıfı, sanal alım butonu aktif mi.
    Bu kurallar yatırım tavsiyesi değildir; sonraki adımda kolayca
    değiştirilebilecek tek bir noktada tutulur.
    """
    if change >= 5:
        return "Güçlü AL", "strong-buy", True
    if change >= 1.5:
        return "AL", "buy", True
    if change <= -5:
        return "Güçlü SAT", "strong-sell", False
    if change <= -1.5:
        return "SAT", "sell", False
    return "Bekle", "wait", False


def price_precision(price: float) -> int:
    """TRY fiyatını okunabilir olacak kadar hassas biçimde biçimlendir."""
    if price >= 100:
        return 2
    if price >= 1:
        return 4
    return 8


def build_markets() -> dict[str, Any]:
    """BtcTurk TRY paritelerini indirip en hareketli olanları hazırla."""
    tickers = exchange.fetch_tickers()
    markets: list[dict[str, Any]] = []

    for symbol, ticker in tickers.items():
        if not symbol.endswith("/TRY"):
            continue

        last = ticker.get("last")
        percentage = ticker.get("percentage")
        base_volume = ticker.get("baseVolume") or 0

        if last is None or percentage is None:
            continue

        price = float(last)
        change = float(percentage)
        signal, signal_class, buy_enabled = signal_for(change)

        markets.append({
            "symbol": symbol,
            "price": price,
            "formatted_price": f"{price:,.{price_precision(price)}f} ₺",
            "change": round(change, 2),
            "volume": float(base_volume),
            "signal": signal,
            "signal_class": signal_class,
            "buy_enabled": buy_enabled,
        })

    # Hareketi en yüksek olan pariteleri seçer, ardından yükselen ve düşen
    # coinleri aynı listede gösterebilmek için değişime göre sıralar.
    active = sorted(markets, key=lambda item: abs(item["change"]), reverse=True)[:MARKET_LIMIT]
    active.sort(key=lambda item: item["change"], reverse=True)

    return {
        "status": "success",
        "source": "BtcTurk",
        "updated_at": int(time.time() * 1000),
        "count": len(markets),
        "markets": active,
    }


@app.get("/api/markets")
def markets():
    """Arayüzün 10 saniyede bir çağıracağı canlı piyasa verisi."""
    now = time.monotonic()
    cached = _market_cache["data"]

    if cached and now - _market_cache["created_at"] < CACHE_SECONDS:
        return jsonify(cached)

    try:
        data = build_markets()
        _market_cache["created_at"] = now
        _market_cache["data"] = data
        return jsonify(data)
    except ccxt.BaseError:
        app.logger.exception("BtcTurk piyasa verisi alınamadı")
        return jsonify({
            "status": "error",
            "message": "BtcTurk verisine şu an ulaşılamıyor. Lütfen tekrar deneyin.",
        }), 503
    except Exception:
        app.logger.exception("Beklenmeyen piyasa verisi hatası")
        return jsonify({
            "status": "error",
            "message": "Piyasa verisi hazırlanırken bir hata oluştu.",
        }), 500


@app.get("/api/status")
def status():
    """Basit uygulama durum denetimi."""
    return jsonify({"status": "online", "source": "BtcTurk", "mode": "paper-trading"})


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"status": "error", "message": "Sayfa bulunamadı."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000, debug=False)
