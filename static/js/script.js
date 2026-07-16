const API_URL = "/api/veri";
const REFRESH_INTERVAL = 15_000;

let marketData = [];
let portfolio = readStorage("portfolio");
let history = readStorage("history");
let selectedCoin = null;

const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const byId = (id) => document.getElementById(id);

function readStorage(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function updateClock() {
  byId("clock").textContent = new Date().toLocaleTimeString("tr-TR");
}

function toast(message, isError = false) {
  const element = byId("toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.remove("show"), 3_000);
}

function setConnectionStatus(text, online) {
  byId("connectionStatus").textContent = text;
  document.querySelector(".status-dot").classList.toggle("offline", !online);
}

function signalFor(change) {
  if (change >= 0.5) return ["🚀 Güçlü AL", "strong-buy"];
  if (change >= 0.1) return ["🔥 AL", "buy"];
  if (change <= -0.5) return ["💥 Güçlü SAT", "strong-sell"];
  if (change <= -0.1) return ["🚨 SAT", "sell"];
  return ["Bekle", "wait"];
}

function createCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function sectionRow(label, className) {
  const row = document.createElement("tr");
  const cell = createCell(row, label, `section-title ${className}`);
  cell.colSpan = 5;
  return row;
}

function appendMarketRow(body, coin) {
  const row = document.createElement("tr");
  const [signal, badgeClass] = signalFor(coin.change);
  createCell(row, coin.symbol);
  createCell(row, coin.formatted_price);
  createCell(row, `${coin.change.toFixed(2)}%`, coin.change >= 0 ? "green" : "red");
  const signalCell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `badge ${badgeClass}`;
  badge.textContent = signal;
  signalCell.append(badge);
  row.append(signalCell);
  const actionCell = document.createElement("td");
  const buy = document.createElement("button");
  buy.className = "btn-buy";
  buy.textContent = "AL";
  buy.addEventListener("click", () => openBuyModal(coin));
  actionCell.append(buy);
  row.append(actionCell);
  body.append(row);
}

function drawMarket(gainers, losers) {
  const body = byId("marketTable");
  body.replaceChildren();
  if (!gainers.length && !losers.length) {
    body.innerHTML = "<tr><td colspan=\"5\">Gösterilecek piyasa verisi bulunamadı.</td></tr>";
    return;
  }
  body.append(sectionRow("🚀 EN ÇOK YÜKSELENLER", "positive"));
  gainers.forEach((coin) => appendMarketRow(body, coin));
  body.append(sectionRow("📉 EN ÇOK DÜŞENLER", "negative"));
  losers.forEach((coin) => appendMarketRow(body, coin));
}

function updateCards(total) {
  byId("coinCount").textContent = total;
  byId("buyCount").textContent = marketData.filter((coin) => coin.change >= 0.1).length;
  byId("sellCount").textContent = marketData.filter((coin) => coin.change <= -0.1).length;
}

async function loadMarket() {
  try {
    const response = await fetch(API_URL);
    const json = await response.json();
    if (!response.ok || json.status !== "success") throw new Error(json.message || "Veri alınamadı.");
    const unique = new Map([...json.gainers, ...json.losers].map((coin) => [coin.symbol, coin]));
    marketData = [...unique.values()];
    drawMarket(json.gainers, json.losers);
    updateCards(json.count);
    drawPortfolio();
    byId("lastUpdate").textContent = new Date().toLocaleTimeString("tr-TR");
    setConnectionStatus("Çevrimiçi", true);
  } catch (error) {
    console.error(error);
    setConnectionStatus("Bağlantı yok", false);
    toast(error.message || "Sunucu bağlantısı kurulamadı.", true);
  }
}

function openBuyModal(coin) {
  selectedCoin = coin;
  byId("modalCoinName").textContent = `${coin.symbol} satın al`;
  byId("buyAmount").value = "";
  byId("targetPercent").value = "10";
  byId("stopPercent").value = "5";
  byId("buyModal").classList.remove("hidden");
  byId("buyAmount").focus();
}

function closeBuyModal() {
  byId("buyModal").classList.add("hidden");
  selectedCoin = null;
}

function savePurchase() {
  const amountTL = Number(byId("buyAmount").value);
  const targetPercent = Number(byId("targetPercent").value);
  const stopPercent = Number(byId("stopPercent").value);
  if (!selectedCoin || !Number.isFinite(amountTL) || amountTL <= 0 || !Number.isFinite(targetPercent) || targetPercent < 0 || !Number.isFinite(stopPercent) || stopPercent < 0 || stopPercent >= 100) {
    toast("Lütfen geçerli tutar, hedef ve stop değerleri girin.", true);
    return;
  }
  portfolio.unshift({ symbol: selectedCoin.symbol, buyPrice: selectedCoin.price, amountTL, coinAmount: amountTL / selectedCoin.price, targetPercent, stopPercent, buyDate: new Date().toLocaleString("tr-TR") });
  const symbol = selectedCoin.symbol;
  saveStorage("portfolio", portfolio);
  closeBuyModal();
  drawPortfolio();
  toast(`${symbol} portföye eklendi.`);
}

function currentPrice(item) {
  return marketData.find((coin) => coin.symbol === item.symbol)?.price ?? item.buyPrice;
}

function drawPortfolio() {
  const body = byId("portfolioTable");
  body.replaceChildren();
  if (!portfolio.length) {
    body.innerHTML = "<tr><td colspan=\"5\">Henüz açık işlem bulunmuyor.</td></tr>";
    return;
  }
  portfolio.forEach((item, index) => {
    const current = currentPrice(item);
    const profit = ((current - item.buyPrice) / item.buyPrice) * 100;
    const row = document.createElement("tr");
    createCell(row, item.symbol); createCell(row, currency.format(item.buyPrice)); createCell(row, currency.format(current)); createCell(row, `${profit.toFixed(2)}%`, profit >= 0 ? "green" : "red");
    const action = document.createElement("td"); const sell = document.createElement("button");
    sell.className = "btn-sell"; sell.textContent = "SAT"; sell.addEventListener("click", () => sellCoin(index)); action.append(sell); row.append(action); body.append(row);
  });
}

function sellCoin(index) {
  const item = portfolio[index];
  const current = currentPrice(item);
  const result = ((current - item.buyPrice) / item.buyPrice) * 100;
  history.unshift({ date: new Date().toLocaleString("tr-TR"), symbol: item.symbol, buy: item.buyPrice, sell: current, result });
  portfolio.splice(index, 1);
  saveStorage("portfolio", portfolio); saveStorage("history", history);
  drawPortfolio(); drawHistory(); toast(`${item.symbol} satıldı.`);
}

function drawHistory() {
  const body = byId("historyTable"); body.replaceChildren();
  if (!history.length) { body.innerHTML = "<tr><td colspan=\"5\">Henüz işlem geçmişi bulunmuyor.</td></tr>"; return; }
  history.forEach((item) => { const row = document.createElement("tr"); createCell(row, item.date); createCell(row, item.symbol); createCell(row, currency.format(item.buy)); createCell(row, currency.format(item.sell)); createCell(row, `${Number(item.result).toFixed(2)}%`, item.result >= 0 ? "green" : "red"); body.append(row); });
}

document.addEventListener("DOMContentLoaded", async () => {
  byId("savePurchase").addEventListener("click", savePurchase);
  document.querySelector(".close-btn").addEventListener("click", closeBuyModal);
  byId("buyModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeBuyModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeBuyModal(); });
  updateClock(); window.setInterval(updateClock, 1_000);
  drawPortfolio(); drawHistory();
  await loadMarket();
  byId("loader").classList.add("hidden");
  window.setInterval(loadMarket, REFRESH_INTERVAL);
});
