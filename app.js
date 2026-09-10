'use strict';

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzgA0PYUSJRj9n7uh043pKpMspjlM4sh5rN9elzg9VcrGKh2mNW3Q2krDIANrui7b5ItQ/exec';
const UNIFIED_GID = '444457785';
const LAST_UNIFIED_ROW_KEY = 'kakeiboLastUnifiedRow';
const $ = id => document.getElementById(id);
const form = $('entry');
let sending = false;
let pendingEntryId = '';

function newEntryId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint32Array(4);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(36)).join('-') || 'entry-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
function ensureEntryId() {
  if (!pendingEntryId) pendingEntryId = newEntryId();
  return pendingEntryId;
}
function formatDate(value) {
  if (!value) return '日付を選択してください';
  const parts = value.split('-').map(Number);
  return String(parts[0]) + '年' + String(parts[1]) + '月' + String(parts[2]) + '日';
}
function updateDate() { $('summaryDate').textContent = formatDate($('date').value); }
function setRadio(name, value) {
  const input = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
  if (input) input.checked = true;
}
function renderPaymentItems() {
  const items = Kakeibo.itemsFor($('category').value);
  const area = $('paymentItemArea');
  const target = $('paymentItems');
  target.replaceChildren();
  if (!items.length) {
    area.hidden = true;
    return;
  }
  area.hidden = false;
  target.className = 'choice-grid ' + (items.length > 3 ? 'three' : 'two');
  items.forEach(item => {
    const label = document.createElement('label');
    label.className = 'choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'paymentItem';
    input.value = item;
    input.required = true;
    const text = document.createElement('span');
    text.textContent = item;
    label.append(input, text);
    target.append(label);
  });
}
function applyDefaults() {
  const item = Kakeibo.defaults($('category').value);
  setRadio('type', item.type);
  setRadio('frequency', item.frequency);
  setRadio('nature', item.nature);
  renderPaymentItems();
  $('investmentHint').hidden = item.name !== 'NISA・積立';
}
function sheetUrl() {
  const raw = window.KAKEIBO_CONFIG && window.KAKEIBO_CONFIG.spreadsheetUrl;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/d/')) {
    throw new Error('支出一覧のリンク先が設定されていません。');
  }
  const row = Number(localStorage.getItem(LAST_UNIFIED_ROW_KEY));
  url.hash = 'gid=' + UNIFIED_GID + (Number.isSafeInteger(row) && row > 1 ? '&range=A' + row : '');
  return url.href;
}
function updateSheetLink() {
  try { $('viewSheet').href = sheetUrl(); } catch (_) { /* click handler provides the visible message */ }
}

async function refreshLastSheetRow() {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=UTF-8'},
    body: JSON.stringify({action: 'tail'})
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const result = await response.json();
  const row = Number(result.unifiedRow);
  if (result.ok !== true || !Number.isSafeInteger(row) || row < 1) {
    throw new Error(result.error || '最終行を確認できませんでした。');
  }
  localStorage.setItem(LAST_UNIFIED_ROW_KEY, String(row));
  updateSheetLink();
}

for (const item of Kakeibo.categories) {
  const option = document.createElement('option');
  option.value = item.name;
  option.textContent = item.label;
  $('category').append(option);
}
$('date').value = Kakeibo.localDate();
applyDefaults();
updateDate();
updateSheetLink();

$('category').addEventListener('change', () => {
  applyDefaults();
});

// 送信失敗後に内容を変更した場合は、同じ記録IDを再利用しない。
// 変更しなければ同じIDのまま安全に再送できる。
form.addEventListener('input', () => {
  if (!sending && pendingEntryId) pendingEntryId = '';
});

form.addEventListener('change', () => {
  if (!sending && pendingEntryId) pendingEntryId = '';
});
$('date').addEventListener('input', updateDate);
$('date').addEventListener('change', updateDate);
$('viewSheet').addEventListener('click', async event => {
  event.preventDefault();
  $('status').textContent = '家計簿を開いています…';
  try {
    await refreshLastSheetRow();
  } catch (_) {
    // 通信できない場合も、端末に保存済みの最終行を使って開く。
  }
  try { window.location.assign(sheetUrl()); }
  catch (error) { $('status').textContent = error.message; }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending) return;
  let data;
  try {
    data = Kakeibo.payload(Object.assign({}, Object.fromEntries(new FormData(form)), {entryId: ensureEntryId()}));
  } catch (error) {
    $('status').textContent = error.message;
    return;
  }

  sending = true;
  $('submit').disabled = true;
  $('submit').textContent = '送信中…';
  $('status').textContent = '';
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=UTF-8'},
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (result.ok !== true || !Number.isSafeInteger(Number(result.unifiedRow))) {
      throw new Error(result.error || '保存結果を確認できませんでした。');
    }
    localStorage.setItem(LAST_UNIFIED_ROW_KEY, String(result.unifiedRow));
    updateSheetLink();
    $('amount').value = '';
    $('note').value = '';
    pendingEntryId = '';
    $('status').textContent = '記録しました。続けて入力できます。';
    $('amount').focus();
  } catch (_) {
    $('status').textContent = '保存結果を確認できませんでした。入力内容は残しています。支出一覧を確認してから、同じ内容で再送してください。';
  } finally {
    sending = false;
    $('submit').disabled = false;
    $('submit').textContent = '送信';
  }
});
