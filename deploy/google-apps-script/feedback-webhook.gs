/**
 * SUMMONS CODE v1.53 feedback receiver.
 *
 * Script Properties:
 *   FEEDBACK_TOKEN: LightsailのFEEDBACK_WEBHOOK_TOKENと同じ長いランダム値
 *   SPREADSHEET_ID: 任意。未設定時は既定の専用シートを使用
 */
const DEFAULT_SPREADSHEET_ID = '1kLKpTQJa0Eqjksf4gpo9P84rHt2IVBQJ5Lf7UaMFYeE';
const FEEDBACK_SHEET_NAME = '回答';
const FEEDBACK_CATEGORY_LABELS = Object.freeze({
  improvement: '改善要望',
  bug: 'バグ報告',
  impression: '感想',
  other: 'その他',
});

function feedbackJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function doPost(e) {
  const properties = PropertiesService.getScriptProperties();
  const expectedToken = properties.getProperty('FEEDBACK_TOKEN') || '';
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (error) {
    return feedbackJson_({ ok: false, error: 'invalid_json' });
  }
  if (!expectedToken || String(body.token || '') !== expectedToken)
    return feedbackJson_({ ok: false, error: 'unauthorized' });

  const category = String(body.category || '');
  const label = FEEDBACK_CATEGORY_LABELS[category];
  const message = String(body.message || '').trim();
  const version = String(body.version || '').slice(0, 16);
  const sendId = String(body.sendId || '').slice(0, 80);
  if (!label || !message || message.length > 1201 || !sendId)
    return feedbackJson_({ ok: false, error: 'invalid_payload' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return feedbackJson_({ ok: false, error: 'busy' });
  try {
    const spreadsheetId = properties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(FEEDBACK_SHEET_NAME);
    if (!sheet) return feedbackJson_({ ok: false, error: 'sheet_not_found' });

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const duplicate = sheet.getRange(2, 5, lastRow - 1, 1)
        .createTextFinder(sendId).matchEntireCell(true).findNext();
      if (duplicate) return feedbackJson_({ ok: true, duplicate: true });
    }

    sheet.appendRow([
      new Date(),
      label,
      safeSheetText_(message),
      safeSheetText_(version),
      safeSheetText_(sendId),
    ]);
    const row = sheet.getLastRow();
    sheet.getRange(row, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.getRange(row, 3).setWrap(true).setVerticalAlignment('top');
    return feedbackJson_({ ok: true });
  } catch (error) {
    console.error('[feedback] append failed');
    return feedbackJson_({ ok: false, error: 'append_failed' });
  } finally {
    lock.releaseLock();
  }
}
