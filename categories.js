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
    ['自己投資','不定期','変動','ゆとり'], ['かずや','毎月','固定','ゆとり'],
    // 過去の国民健康保険・国民年金の記録と税金の分類設定に合わせた暫定初期値。変更は常に可能。
    ['社会保険料','不定期','固定','消費']
  ];

  const paymentItems = {
    '通信費': ['携帯','ケーブルテレビ','その他'],
    '教育費': ['教育費','給食費'],
    '保険料': ['自動車保険','火災保険','生命保険','自転車保険','その他'],
    '税金': ['固定資産税','住民税','自動車税','軽自動車税','その他'],
    '社会保険料': ['国民健康保険','国民年金','その他']
  };
  const icons = {
    '食費': '🍴', '生活雑貨': '🧺', '生活用品': '🧻', 'ガソリン代': '⛽',
    '医療費': '🏥', '水道代': '🚰', '電気代': '💡', '灯油代': '🛢️',
    '通信費': '📱', '教育費': '🎓', '家族費': '👨‍👩‍👧', '交際費': '🤝',
    '衣類': '👕', '家具・家電': '🛋️', '職場': '🧑‍🚒', '剣道': '🥋',
    'テニス': '🎾', '保険料': '🛡️', '税金': '🧾', 'かな': '👧',
    '資格試験・教養': '📚', 'コインランドリー': '🫧', 'クリーニング': '👔',
    '冠婚葬祭': '💐', '寄付金': '🤲', '住居費（固定費）': '🏠',
    '住居費（変動費）': '🛠️', '車両費（固定費）': '🚗', '車両費（変動費）': '🔧',
    'NISA・積立': '📈', '自己投資': '🚀', 'かずや': '🙋', '社会保険料': '🏛️'
  };
  const types = ['生活に必要','ゆとり'];
  const frequencies = ['毎月','不定期'];
  const natures = ['固定','変動'];
  const categories = rows.map(([name, frequency, nature, legacyLevel], index) => ({
    name, icon: icons[name] || '📌', frequency, nature, legacyLevel, order: index + 1,
    label: (icons[name] || '📌') + ' ' + name,
    type: legacyLevel === '消費' ? '生活に必要' : 'ゆとり'
  }));

  function defaults(name) { return categories.find(category => category.name === name); }
  function itemsFor(category) { return paymentItems[category] || []; }
  function localDate(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function validEntryId(entryId) { return /^[a-zA-Z0-9_-]{16,128}$/.test(String(entryId || '')); }
  function payload(values) {
    const amount = Number(values.amount);
    const category = defaults(values.category);
    const items = itemsFor(values.category);
    if (!String(values.amount).trim() || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('金額は1円以上の整数で入力してください。');
    }
    if (!category || !types.includes(values.type)) throw new Error('費目と使い道を選択してください。');
    if (!frequencies.includes(values.frequency) || !natures.includes(values.nature)) {
      throw new Error('頻度と性質を選択してください。');
    }
    if (items.length && !items.includes(values.paymentItem)) {
      throw new Error('支払い項目を選択してください。');
    }
    if (!validEntryId(values.entryId)) throw new Error('送信の準備に失敗しました。画面を再読み込みしてください。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error('日付を入力してください。');
    const [year, month, day] = values.date.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error('正しい日付を入力してください。');
    }
    return {
      entryId: String(values.entryId), amount: String(amount), category: values.category,
      paymentItem: items.length ? values.paymentItem : values.category,
      type: values.type, frequency: values.frequency, nature: values.nature,
      date: `${year}年${month}月${day}日`, note: String(values.note || '').trim()
    };
  }

  const api = { categories, types, frequencies, natures, paymentItems, icons, defaults, itemsFor, localDate, validEntryId, payload };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Kakeibo = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
