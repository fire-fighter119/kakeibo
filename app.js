'use strict';

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzgA0PYUSJRj9n7uh043pKpMspjlM4sh5rN9elzg9VcrGKh2mNW3Q2krDIANrui7b5ItQ/exec';
const UNIFIED_GID = '444457785';
const LAST_UNIFIED_ROW_KEY = 'kakeiboLastUnifiedRow';
const $ = id => document.getElementById(id);
const form = $('entry');
let savingLocally = false;
let syncing = false;
let latestRow = 0;
let notice = '';
let receipt = null;
let activeEntry = null;
const outbox = KakeiboOutbox;
const failedEntries = new Map();

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
  let row = latestRow;
  try { row = row || Number(localStorage.getItem(LAST_UNIFIED_ROW_KEY)); } catch (_) {}
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
  rememberRow(row);
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

function rememberRow(row) {
  latestRow = row;
  try { localStorage.setItem(LAST_UNIFIED_ROW_KEY, String(row)); } catch (_) {}
  updateSheetLink();
}

function positionDock() {
  const viewport = window.visualViewport;
  const offset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--keyboard-offset', offset + 'px');
  const height = $('sendDock').getBoundingClientRect().height;
  document.body.style.paddingBottom = (height + 30) + 'px';
}
window.visualViewport?.addEventListener('resize', positionDock);
window.visualViewport?.addEventListener('scroll', positionDock);
window.addEventListener('resize', positionDock);
new ResizeObserver(positionDock).observe($('sendDock'));
positionDock();

async function renderOutbox() {
  const entries = (await outbox.all()).sort((a, b) => a.queuedAt - b.queuedAt);
  $('outboxArea').hidden = entries.length === 0;
  $('outboxSummary').textContent = '送信待ち ' + entries.length + '件';
  $('outboxList').replaceChildren();
  for (const entry of entries) {
    const li = document.createElement('li');
    li.textContent = entry.date + ' · ' + entry.paymentItem + ' · ' + Number(entry.amount).toLocaleString('ja-JP') + '円';
    if (failedEntries.has(entry.entryId)) li.textContent += ' — ' + failedEntries.get(entry.entryId);
    $('outboxList').append(li);
  }
  $('retry').disabled = syncing || !entries.length;
  const status = $('status');
  status.dataset.state = notice ? 'notice' : entries.length ? (syncing ? 'sending' : 'pending') : receipt ? 'success' : 'idle';
  if (notice) status.textContent = notice;
  else if (entries.length) {
    const item = activeEntry || entries[0];
    const label = item.paymentItem + ' ' + Number(item.amount).toLocaleString('ja-JP') + '円';
    status.textContent = (syncing ? '送信中…' : '送信待ち') + '\n' + label + '（未完了 ' + entries.length + '件）';
    if (!syncing) status.textContent += '\n保存はまだ完了していません。自動で再送します。';
  } else if (receipt) {
    status.textContent = '✓ 送信完了\n' + receipt.paymentItem + ' ' + Number(receipt.amount).toLocaleString('ja-JP') + '円\n家計簿への保存を確認しました。';
  } else status.textContent = '';
}

async function sendEntry(entry) {
  const {queuedAt, ...data} = entry;
  const body = JSON.stringify(data);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=UTF-8'},
      body,
      // Keepalive is best effort. IndexedDB + the same entryId cover interruptions.
      keepalive: true,
      signal: controller.signal
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    const row = Number(result.unifiedRow);
    if (result.ok !== true || result.entryId !== data.entryId || !Number.isSafeInteger(row) || row < 2) {
      throw new Error('保存結果を確認できませんでした');
    }
    // Delete only after the receiver acknowledges this exact entry.
    await outbox.remove(data.entryId);
    rememberRow(row);
    failedEntries.delete(data.entryId);
    receipt = data;
  } finally {
    clearTimeout(timeout);
  }
}

async function flushOutbox() {
  if (syncing || navigator.onLine === false) return;
  syncing = true;
  let saved = false;
  const attempted = new Set();
  try {
    // Pick up entries added during an earlier network request as well.
    while (true) {
      const entries = (await outbox.all()).filter(entry => !attempted.has(entry.entryId))
        .sort((a, b) => a.queuedAt - b.queuedAt);
      if (!entries.length) break;
      for (const entry of entries) {
        attempted.add(entry.entryId);
        try {
          activeEntry = entry;
          await renderOutbox();
          await sendEntry(entry);
          saved = true;
        } catch (_) {
          failedEntries.set(entry.entryId, '未確認・再送待ち');
        }
        await renderOutbox();
      }
    }
    const remaining = await outbox.all();
    if (!remaining.length && saved) notice = '';
  } catch (_) {
    notice = '端末の送信待ちを確認できません。もう一度開き直してください。';
  } finally {
    syncing = false;
    activeEntry = null;
    await renderOutbox().catch(() => {});
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (savingLocally) return;
  let data;
  try {
    data = Kakeibo.payload({...Object.fromEntries(new FormData(form)), entryId: outbox.newId()});
    if (new Blob([JSON.stringify(data)]).size > 60000) throw new Error('メモが長すぎます。短くして送信してください。');
  } catch (error) {
    notice = error.message;
    $('status').dataset.state = 'error';
    $('status').textContent = notice;
    return;
  }
  savingLocally = true;
  $('submit').disabled = true;
  $('submit').textContent = '端末に保存中…';
  receipt = null;
  notice = '送信の準備中…';
  $('status').dataset.state = 'sending';
  $('status').textContent = notice;
  // Disable only for the short local transaction, not for the network round trip.
  const controls = Array.from(form.elements).filter(el => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  controls.forEach(el => { el.disabled = true; });
  try {
    await outbox.add(data);
    $('amount').value = '';
    $('note').value = '';
    notice = '';
    document.activeElement?.blur();
    await renderOutbox().catch(() => { $('status').textContent = '端末に保存しました。送信待ちです。'; });
  } catch (_) {
    notice = '端末に保存できませんでした。入力は残しています。空き容量やブラウザ設定を確認してください。';
    $('status').dataset.state = 'error';
    $('status').textContent = notice;
  } finally {
    controls.forEach(el => { el.disabled = false; });
    savingLocally = false;
    $('submit').disabled = false;
    $('submit').textContent = '送信';
  }
  void flushOutbox();
});

$('retry').addEventListener('click', () => { notice = ''; void flushOutbox(); });
window.addEventListener('online', () => { notice = ''; void flushOutbox(); });
window.addEventListener('pageshow', () => { void flushOutbox(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void flushOutbox();
});
setInterval(() => {
  if (document.visibilityState === 'visible') void flushOutbox();
}, 30000);
renderOutbox().then(flushOutbox).catch(() => {
  notice = '端末の保存機能を利用できません。送信時に保存を確認します。';
  $('status').textContent = notice;
});
