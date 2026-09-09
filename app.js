'use strict';
// Existing destination; pressing the visible send button submits the entry.
const ENDPOINT='https://script.google.com/macros/s/AKfycbzgA0PYUSJRj9n7uh043pKpMspjlM4sh5rN9elzg9VcrGKh2mNW3Q2krDIANrui7b5ItQ/exec';
const $=id=>document.getElementById(id), form=$('entry');
let sending=false, submitted=false;
const LAST_EXPENSE_ROW_KEY='kakeiboLastExpenseRow';
for (const item of Kakeibo.categories) {
  const option=document.createElement('option'); option.value=item.name; option.textContent=item.name; $('category').append(option);
}
function applyDefaults() {
  const item=Kakeibo.defaults($('category').value);
  form.elements.type.value=item.type;
  form.elements.frequency.value=item.frequency; form.elements.nature.value=item.nature;
  $('investmentHint').hidden=item.name!=='NISA・積立';
  updateSummary();
}
function updateSummary() {
  const value=$('date').value, [y,m,d]=value.split('-').map(Number);
  $('summaryDate').textContent=value?`${y}年${m}月${d}日`:'日付を選択してください';
}
form.addEventListener('input',updateSummary);
form.addEventListener('change',updateSummary);
$('date').addEventListener('click',()=>{
  try { $('date').showPicker?.(); } catch { /* Native date field remains usable. */ }
});
$('category').addEventListener('change',applyDefaults);
$('date').value=Kakeibo.localDate(); applyDefaults();
function sheetUrl() {
  const raw=window.KAKEIBO_CONFIG?.spreadsheetUrl;
  const url=new URL(raw);
  if(url.protocol!=='https:' || url.hostname!=='docs.google.com' || !url.pathname.startsWith('/spreadsheets/d/'))throw new Error('Invalid sheet URL');
  const row=Number(localStorage.getItem(LAST_EXPENSE_ROW_KEY));
  if(Number.isSafeInteger(row)&&row>0)url.hash=`gid=1732160294&range=B${row}`;
  return url.href;
}
try { $('viewSheet').href=sheetUrl(); } catch { /* Click handler shows the setup error. */ }
$('viewSheet').addEventListener('click',event=>{
  try {
    $('viewSheet').href=sheetUrl();
  } catch {
    event.preventDefault();
    $('status').textContent='家計簿のリンク先がまだ設定されていません。スプレッドシートのURLを設定すると開けます。';
  }
});
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(sending||submitted)return;
  let data;
  try { data=Kakeibo.payload(Object.fromEntries(new FormData(form))); }
  catch(error) { $('status').textContent=error.message; return; }
  $('payload').textContent=JSON.stringify(data,null,2);
  sending=true; $('submit').disabled=true; $('submit').textContent='送信中…'; $('status').textContent='';
  try {
    const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(data)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const result=await response.json();
    if(result.ok!==true)throw new Error(result.error||'保存できませんでした');
    if(Number.isSafeInteger(Number(result.expenseRow)))localStorage.setItem(LAST_EXPENSE_ROW_KEY,String(result.expenseRow));
    $('viewSheet').href=sheetUrl();
    $('amount').value=''; $('note').value='';
    submitted=false;
    $('submit').disabled=false; $('submit').textContent='送信';
    $('status').textContent='記録しました。続けて入力できます。';
    $('amount').focus();
  } catch {
    submitted=true;
    $('submit').textContent='送信結果を確認してください';
    $('status').textContent='保存結果を確認できませんでした。入力内容は残しています。重複を防ぐため、再送する前に家計簿を確認してください。';
  } finally {sending=false;}
});
