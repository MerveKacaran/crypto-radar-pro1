"use strict";

const API_URL = "/api/markets";
const REFRESH_INTERVAL = 15_000;
const PORTFOLIO_KEY = "crypto-radar-portfolio";
const HISTORY_KEY = "crypto-radar-history";

const state = {
    prices: new Map(),
    selectedMarket: null,
    portfolio: readStorage(PORTFOLIO_KEY),
    history: readStorage(HISTORY_KEY),
};

const money = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
});

const byId = (id) => document.getElementById(id);

function readStorage(key) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return Array.isArray(data) ? data : [];
    } catch (_error) {
        return [];
    }
}

function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function createCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (className) cell.className = className;
    row.append(cell);
    return cell;
}

function setTableMessage(tableId, colSpan, message) {
    const row = document.createElement("tr");
    const cell = createCell(row, message, "empty-state");
    cell.colSpan = colSpan;
    byId(tableId).replaceChildren(row);
}

function showToast(message, isError = false) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.className = isError ? "toast show error" : "toast show";
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
        toast.className = "toast";
    }, 3500);
}

function setConnection(text, mode) {
    byId("connectionText").textContent = text;
    byId("connectionDot").className = `connection-dot ${mode}`;
}

function updateClock() {
    byId("clock").textContent = new Date().toLocaleTimeString("tr-TR");
}

function percentText(value) {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function renderMarketTable(markets) {
    const body = byId("marketTable");
    body.replaceChildren();

    if (!markets.length) {
        setTableMessage("marketTable", 5, "Gösterilecek piyasa verisi bulunamadı.");
        return;
    }

    markets.forEach((market) => {
        const row = document.createElement("tr");
        createCell(row, market.symbol);
        createCell(row, market.formatted_price);
        createCell(row, percentText(market.change), market.change >= 0 ? "positive" : "negative");

        const signalCell = document.createElement("td");
        const signal = document.createElement("span");
        signal.className = `signal ${market.signal_class}`;
        signal.textContent = market.signal;
        signalCell.append(signal);
        row.append(signalCell);

        const actionCell = document.createElement("td");
        const buyButton = document.createElement("button");
        buyButton.type = "button";
        buyButton.className = "button button-small";
        buyButton.textContent = "AL";
        buyButton.disabled = !market.buy_enabled;
        buyButton.title = market.buy_enabled ? "Sanal portföye ekle" : "Bu sinyalde alım kapalı";
        buyButton.addEventListener("click", () => openBuyDialog(market));
        actionCell.append(buyButton);
        row.append(actionCell);
        body.append(row);
    });
}

function openBuyDialog(market) {
    state.selectedMarket = market;
    byId("buyDialogTitle").textContent = `${market.symbol} için alım`;
    byId("buyDialogPrice").textContent = `Anlık fiyat: ${money.format(market.price)}`;
    byId("amountInput").value = "";
    byId("targetInput").value = "5";
    byId("buyDialog").showModal();
    byId("amountInput").focus();
}

function closeBuyDialog() {
    byId("buyDialog").close();
    state.selectedMarket = null;
}

function currentPrice(item) {
    return state.prices.get(item.symbol) ?? item.buyPrice;
}

function renderPortfolio() {
    const body = byId("portfolioTable");
    body.replaceChildren();

    if (!state.portfolio.length) {
        setTableMessage("portfolioTable", 6, "Henüz açık işlem bulunmuyor.");
        return;
    }

    state.portfolio.forEach((item) => {
        const latest = currentPrice(item);
        const profit = ((latest - item.buyPrice) / item.buyPrice) * 100;
        const row = document.createElement("tr");
        createCell(row, item.symbol);
        createCell(row, money.format(item.buyPrice));
        createCell(row, money.format(item.targetPrice));
        createCell(row, money.format(latest));
        createCell(row, percentText(profit), profit >= 0 ? "positive" : "negative");

        const actionCell = document.createElement("td");
        const sellButton = document.createElement("button");
        sellButton.type = "button";
        sellButton.className = "button button-danger button-small";
        sellButton.textContent = "SAT";
        sellButton.addEventListener("click", () => sellPosition(item.id));
        actionCell.append(sellButton);
        row.append(actionCell);
        body.append(row);
    });
}

function renderHistory() {
    const body = byId("historyTable");
    body.replaceChildren();

    if (!state.history.length) {
        setTableMessage("historyTable", 5, "Henüz işlem geçmişi bulunmuyor.");
        return;
    }

    state.history.forEach((item) => {
        const row = document.createElement("tr");
        createCell(row, item.closedAt);
        createCell(row, item.symbol);
        createCell(row, money.format(item.buyPrice));
        createCell(row, money.format(item.sellPrice));
        createCell(row, percentText(item.result), item.result >= 0 ? "positive" : "negative");
        body.append(row);
    });
}

function addPosition(event) {
    event.preventDefault();
    const amount = Number(byId("amountInput").value);
    const targetPercent = Number(byId("targetInput").value);
    const market = state.selectedMarket;

    if (!market || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(targetPercent) || targetPercent <= 0) {
        showToast("Lütfen geçerli bir alış tutarı ve hedef kâr oranı girin.", true);
        return;
    }

    const position = {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        symbol: market.symbol,
        buyPrice: market.price,
        amount,
        quantity: amount / market.price,
        targetPercent,
        targetPrice: market.price * (1 + targetPercent / 100),
        openedAt: new Date().toLocaleString("tr-TR"),
    };

    state.portfolio.unshift(position);
    writeStorage(PORTFOLIO_KEY, state.portfolio);
    closeBuyDialog();
    renderPortfolio();
    showToast(`${market.symbol} sanal portföye eklendi.`);
}

function sellPosition(id) {
    const index = state.portfolio.findIndex((item) => item.id === id);
    if (index === -1) return;

    const position = state.portfolio[index];
    const sellPrice = currentPrice(position);
    const result = ((sellPrice - position.buyPrice) / position.buyPrice) * 100;

    state.history.unshift({
        symbol: position.symbol,
        buyPrice: position.buyPrice,
        sellPrice,
        result,
        closedAt: new Date().toLocaleString("tr-TR"),
    });
    state.portfolio.splice(index, 1);
    writeStorage(PORTFOLIO_KEY, state.portfolio);
    writeStorage(HISTORY_KEY, state.history);
    renderPortfolio();
    renderHistory();
    showToast(`${position.symbol} işlemi kapatıldı.`);
}

async function loadMarkets() {
    const refreshButton = byId("refreshButton");
    refreshButton.disabled = true;
    setConnection("Veri yenileniyor…", "");

    try {
        const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
        const data = await response.json();
        if (!response.ok || data.status !== "success") {
            throw new Error(data.message || "Piyasa verisi alınamadı.");
        }

        state.prices = new Map(Object.entries(data.prices || {}).map(([symbol, price]) => [symbol, Number(price)]));
        renderMarketTable(data.markets || []);
        renderPortfolio();
        byId("marketCount").textContent = data.count;
        byId("buySignalCount").textContent = data.markets.filter((item) => item.buy_enabled).length;
        byId("sellSignalCount").textContent = data.markets.filter((item) => item.signal_class.includes("sell")).length;
        byId("lastUpdate").textContent = new Date(data.updated_at).toLocaleTimeString("tr-TR");
        setConnection("Canlı veri", "online");
    } catch (error) {
        console.error(error);
        setConnection("Bağlantı kurulamadı", "offline");
        showToast(error.message || "Sunucu bağlantısı kurulamadı.", true);
    } finally {
        refreshButton.disabled = false;
    }
}

function clearHistory() {
    if (!state.history.length) return;
    if (!window.confirm("İşlem geçmişinin tamamı silinsin mi?")) return;
    state.history = [];
    writeStorage(HISTORY_KEY, state.history);
    renderHistory();
    showToast("İşlem geçmişi temizlendi.");
}

document.addEventListener("DOMContentLoaded", () => {
    byId("refreshButton").addEventListener("click", loadMarkets);
    byId("buyForm").addEventListener("submit", addPosition);
    byId("closeDialogButton").addEventListener("click", closeBuyDialog);
    byId("cancelDialogButton").addEventListener("click", closeBuyDialog);
    byId("clearHistoryButton").addEventListener("click", clearHistory);
    byId("buyDialog").addEventListener("cancel", (event) => {
        event.preventDefault();
        closeBuyDialog();
    });

    updateClock();
    window.setInterval(updateClock, 1_000);
    renderPortfolio();
    renderHistory();
    loadMarkets();
    window.setInterval(loadMarkets, REFRESH_INTERVAL);
});
