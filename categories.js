(function (root) {
  'use strict';
  const rows = [
    ['食費','毎月','変動','消費'], ['生活雑貨','不定期','変動','ゆとり'],
    ['生活用品','毎月','変動','消費'], ['ガソリン代','毎月','変動','消費'],
    ['医療費','不定期','変動','消費'], ['水道代','毎月','変動','消費'],
    ['電気代','毎月','変動','消費'], ['灯油代','不定期','変動','消費'],
    ['通信費','毎月','固定','消費'], ['教育費','毎月','変動','消費'],
    ['家族費','不定期','変動','ゆとり'], ['交際費','不定期','変動','ゆとり'],
    ['衣類','不定期','変動','消費'], ['家具・家電','不定期','変動','ゆとり'],
    ['職場','不定期','変動','ゆとり'], ['剣道','不定期','変動','ゆとり'],
    ['テニス','不定期','変動','ゆとり'], ['保険料','毎月','固定','消費'],
    ['税金','不定期','固定','消費'], ['かな','毎月','固定','ゆとり'],
    ['資格試験・教養','不定期','変動','ゆとり'], ['コインランドリー','不定期','変動','ゆとり'],
    ['クリーニング','不定期','変動','ゆとり'], ['冠婚葬祭','不定期','変動','ゆとり'],
    ['寄付金','不定期','変動','ゆとり'], ['住居費（固定費）','毎月','固定','消費'],
    ['住居費（変動費）','不定期','変動','消費'], ['車両費（固定費）','毎月','固定','消費'],
    ['車両費（変動費）','不定期','変動','消費'], ['NISA・積立','毎月','固定','ゆとり'],
    ['自己投資','不定期','変動','ゆとり'], ['かずや','毎月','固定','ゆとり']
  ];
  const types = ['生活に必要','ゆとり'];
  const categories = rows.map(([name,frequency,nature,legacyLevel],i) => ({
    name,frequency,nature,legacyLevel,order:i+1,
    type:legacyLevel==='消費'?'生活に必要':'ゆとり'
  }));
  function defaults(name) { return categories.find(c=>c.name===name); }
  function localDate(now=new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  function payload(values) {
    const amount=Number(values.amount);
    if (!String(values.amount).trim() || !Number.isSafeInteger(amount) || amount<=0)
      throw new Error('金額は1円以上の整数で入力してください。');
    if (!defaults(values.category) || !types.includes(values.type)) throw new Error('費目と使い道を選択してください。');
    if (!['毎月','不定期'].includes(values.frequency) || !['固定','変動'].includes(values.nature))
      throw new Error('頻度と性質を選択してください。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error('日付を入力してください。');
    const [y,m,d]=values.date.split('-').map(Number), dt=new Date(0);
    dt.setFullYear(y,m-1,d); dt.setHours(12,0,0,0);
    if (dt.getFullYear()!==y || dt.getMonth()!==m-1 || dt.getDate()!==d) throw new Error('正しい日付を入力してください。');
    return {amount:String(amount),category:values.category,type:values.type,
      frequency:values.frequency,nature:values.nature,date:`${y}年${m}月${d}日`,note:String(values.note||'').trim()};
  }
  const api={categories,types,defaults,localDate,payload};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  root.Kakeibo=api;
})(typeof globalThis!=='undefined'?globalThis:window);
