/**
 * 生寫真收藏庫 V2 - Google Apps Script backend
 *
 * 圖片：Google Drive / images
 * 屬性：Google Sheet
 *
 * V2 schema:
 * - seriesName：生寫真系列
 * - type：類型1（全身 / 半身 / 大頭 / 坐姿）
 * - type2：類型2（可空白，自由文字）
 * - tradeStatus：非賣 / 可換 / 可賣 / 求
 *
 * 如果已經使用 V1：
 * 1) 用本檔覆蓋原 Code.gs
 * 2) 執行 migrateToV2()
 * 3) Deploy > Manage deployments > Edit > New version > Deploy
 */

const SHEET_NAME = 'photos';
const HEADERS = [
  'id', 'createdAt', 'updatedAt',
  'seriesName', 'memberName',
  'type', 'type2',
  'quantity', 'tradeStatus', 'unitPrice',
  'imageFileId', 'imageUrl'
];
const CSV_HEADERS = [
  'ID', '建立時間', '更新時間',
  '生寫真系列', '成員名',
  '類型1', '類型2',
  '數量', '狀態', '單價',
  '圖片File ID', '圖片URL'
];

function setupStorage() {
  const props = PropertiesService.getScriptProperties();

  let root;
  const rootId = props.getProperty('ROOT_FOLDER_ID');
  if (rootId) {
    root = DriveApp.getFolderById(rootId);
  } else {
    root = DriveApp.createFolder('生寫真網站資料');
    props.setProperty('ROOT_FOLDER_ID', root.getId());
  }

  let imageFolder;
  const imageFolderId = props.getProperty('IMAGE_FOLDER_ID');
  if (imageFolderId) {
    imageFolder = DriveApp.getFolderById(imageFolderId);
  } else {
    imageFolder = root.createFolder('images');
    props.setProperty('IMAGE_FOLDER_ID', imageFolder.getId());
  }

  let ss;
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    ss = SpreadsheetApp.create('生寫真庫存資料');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  Logger.log('ROOT_FOLDER_ID: ' + root.getId());
  Logger.log('IMAGE_FOLDER_ID: ' + imageFolder.getId());
  Logger.log('SPREADSHEET_ID: ' + ss.getId());
}

/**
 * V1 -> V2 資料遷移。
 *
 * V1:
 * id, createdAt, updatedAt, photoName, memberName, type,
 * quantity, sellable, unitPrice, imageFileId, imageUrl
 *
 * V2:
 * id, createdAt, updatedAt, seriesName, memberName, type,
 * type2, quantity, tradeStatus, unitPrice, imageFileId, imageUrl
 */
function migrateToV2() {
  const sheet = getSheet_();

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const oldHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(String);

  if (oldHeaders.join('|') === HEADERS.join('|')) {
    Logger.log('Already V2.');
    return;
  }

  const oldIndex = {};
  oldHeaders.forEach((h, i) => oldIndex[h] = i);

  const oldRows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, oldHeaders.length).getValues()
    : [];

  const getOld = (row, key, fallback = '') =>
    oldIndex[key] !== undefined ? row[oldIndex[key]] : fallback;

  const migrated = oldRows
    .filter(row => getOld(row, 'id', row[0]))
    .map(row => {
      const oldSellable = getOld(row, 'sellable', false);
      const migratedStatus =
        getOld(row, 'tradeStatus', '') ||
        ((oldSellable === true || String(oldSellable).toLowerCase() === 'true')
          ? '可賣'
          : '非賣');

      return [
        getOld(row, 'id', ''),
        getOld(row, 'createdAt', ''),
        getOld(row, 'updatedAt', ''),
        getOld(row, 'seriesName', '') || getOld(row, 'photoName', ''),
        getOld(row, 'memberName', ''),
        getOld(row, 'type', ''),
        getOld(row, 'type2', ''),
        Number(getOld(row, 'quantity', 0)),
        migratedStatus,
        Number(getOld(row, 'unitPrice', 0)),
        getOld(row, 'imageFileId', ''),
        getOld(row, 'imageUrl', '')
      ];
    });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  if (migrated.length) {
    sheet.getRange(2, 1, migrated.length, HEADERS.length).setValues(migrated);
  }

  sheet.setFrozenRows(1);
  Logger.log('Migration complete. Rows: ' + migrated.length);
}

function doGet() {
  return json_({
    ok: true,
    service: 'seishashin-inventory-v2',
    message: 'Use POST API.'
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Empty request body.');
    }

    const req = JSON.parse(e.postData.contents);
    verifySecret_(req.secret);

    switch (req.action) {
      case 'ping':
        return json_({ ok: true, now: new Date().toISOString() });

      case 'list':
        return json_({ ok: true, items: listItems_() });

      case 'exportData':
        return json_({ ok: true, items: listItems_() });

      case 'replaceAll': {
        const result = replaceAllItems_(req.items || []);
        return json_({ ok: true, ...result });
      }

      case 'create':
        return json_({ ok: true, item: createItem_(req.item, req.image) });

      case 'adjustQty':
        return json_({ ok: true, item: adjustQty_(req.id, req.quantity) });

      case 'delete':
        deleteItem_(req.id);
        return json_({ ok: true });

      default:
        throw new Error('Unknown action.');
    }
  } catch (err) {
    return json_({ ok: false, error: err.message || String(err) });
  }
}

function verifySecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
  if (!expected) throw new Error('Server APP_SECRET is not configured.');
  if (!secret || secret !== expected) throw new Error('Unauthorized.');
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Storage is not initialized. Run setupStorage() first.');

  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Metadata sheet is missing.');

  return sheet;
}

function listItems_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .map(rowToItem_)
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function replaceAllItems_(items) {
  if (!Array.isArray(items)) throw new Error('Items must be an array.');

  const now = new Date();
  const nowIso = now.toISOString();
  const normalized = items.map((item, index) => {
    const candidate = {
      id: String(item.id || '').trim() || Utilities.getUuid(),
      createdAt: String(item.createdAt || '').trim() || nowIso,
      updatedAt: nowIso,
      seriesName: String(item.seriesName || '').trim(),
      memberName: String(item.memberName || '').trim(),
      type: String(item.type || '').trim(),
      type2: String(item.type2 || '').trim(),
      quantity: Number(item.quantity),
      tradeStatus: String(item.tradeStatus || '').trim(),
      unitPrice: item.unitPrice === '' || item.unitPrice === null || item.unitPrice === undefined
        ? 0
        : Number(item.unitPrice),
      imageFileId: String(item.imageFileId || '').trim(),
      imageUrl: String(item.imageUrl || '').trim()
    };
    try {
      validateItem_(candidate);
    } catch (err) {
      throw new Error('第 ' + (index + 2) + ' 列：' + err.message);
    }
    return candidate;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_();
    const oldRows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
      : [];

    const backupFile = backupRows_(oldRows, now);

    try {
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
      }
      if (normalized.length) {
        sheet.getRange(2, 1, normalized.length, HEADERS.length)
          .setValues(normalized.map(itemToRow_));
      }
      const extraRows = sheet.getLastRow() - (normalized.length + 1);
      if (extraRows > 0) {
        sheet.getRange(normalized.length + 2, 1, extraRows, HEADERS.length).clearContent();
      }
      sheet.setFrozenRows(1);
      SpreadsheetApp.flush();
    } catch (writeErr) {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      if (oldRows.length) {
        sheet.getRange(2, 1, oldRows.length, HEADERS.length).setValues(oldRows);
      }
      sheet.setFrozenRows(1);
      SpreadsheetApp.flush();
      throw new Error('覆蓋失敗，已自動還原原資料：' + writeErr.message);
    }

    return {
      count: normalized.length,
      backupFileName: backupFile.getName(),
      backupFileId: backupFile.getId()
    };
  } finally {
    lock.releaseLock();
  }
}

function backupRows_(rows, timestamp) {
  const folder = getBackupFolder_();
  const name = '生寫真資料備份_' + formatBackupTimestamp_(timestamp) + '.csv';
  const lines = [CSV_HEADERS.map(csvEscape_).join(',')];
  rows.forEach(row => lines.push(row.map(csvEscape_).join(',')));
  const csv = '\uFEFF' + lines.join('\r\n');
  return folder.createFile(name, csv, 'text/csv');
}

function getBackupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('BACKUP_FOLDER_ID');
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); }
    catch (err) { console.warn('Backup folder id invalid, recreating.'); }
  }

  const rootId = props.getProperty('ROOT_FOLDER_ID');
  if (!rootId) throw new Error('ROOT_FOLDER_ID is missing. Run setupStorage() first.');
  const root = DriveApp.getFolderById(rootId);
  const folders = root.getFoldersByName('backups');
  const folder = folders.hasNext() ? folders.next() : root.createFolder('backups');
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function formatBackupTimestamp_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyyMMdd_HHmmss');
}

function csvEscape_(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function createItem_(item, image) {
  validateItem_(item);

  if (!image || !image.base64 || !image.mimeType) {
    throw new Error('Image is required.');
  }

  const imageFolderId = PropertiesService
    .getScriptProperties()
    .getProperty('IMAGE_FOLDER_ID');

  if (!imageFolderId) throw new Error('Image folder is not initialized.');

  const bytes = Utilities.base64Decode(image.base64);
  const filename = sanitizeFilename_(image.filename || Utilities.getUuid() + '.jpg');
  const blob = Utilities.newBlob(bytes, image.mimeType, filename);
  const file = DriveApp.getFolderById(imageFolderId).createFile(blob);

  // V2 仍延續 MVP 策略：讓 GitHub Pages 可以直接載入 Drive 縮圖。
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    console.warn('Unable to set public link sharing: ' + err);
  }

  const now = new Date().toISOString();

  const created = {
    id: Utilities.getUuid(),
    createdAt: now,
    updatedAt: now,
    seriesName: String(item.seriesName).trim(),
    memberName: String(item.memberName).trim(),
    type: String(item.type),
    type2: String(item.type2 || '').trim(),
    quantity: Number(item.quantity),
    tradeStatus: String(item.tradeStatus),
    unitPrice: Number(item.unitPrice || 0),
    imageFileId: file.getId(),
    imageUrl: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1200`
  };

  getSheet_().appendRow(itemToRow_(created));
  return created;
}

function adjustQty_(id, quantity) {
  const qty = Number(quantity);

  if (!id || !Number.isInteger(qty) || qty < 1) {
    throw new Error('Invalid quantity.');
  }

  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);
  if (!rowIndex) throw new Error('Record not found.');

  const quantityCol = HEADERS.indexOf('quantity') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;

  sheet.getRange(rowIndex, quantityCol).setValue(qty);
  sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

  return rowToItem_(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );
}

function deleteItem_(id) {
  if (!id) throw new Error('Missing id.');

  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);
  if (!rowIndex) throw new Error('Record not found.');

  const item = rowToItem_(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );

  if (item.imageFileId) {
    try {
      DriveApp.getFileById(item.imageFileId).setTrashed(true);
    } catch (err) {
      console.warn('Unable to trash image: ' + err);
    }
  }

  sheet.deleteRow(rowIndex);
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const idx = idValues.findIndex(row => String(row[0]) === String(id));

  return idx < 0 ? 0 : idx + 2;
}

function validateItem_(item) {
  if (!item) throw new Error('Missing item.');

  if (!String(item.seriesName || '').trim()) {
    throw new Error('生寫真系列為必填。');
  }

  if (!String(item.memberName || '').trim()) {
    throw new Error('成員名為必填。');
  }

  if (!['全身', '半身', '大頭', '坐姿'].includes(String(item.type))) {
    throw new Error('類型1不正確。');
  }

  if (!['非賣', '可換', '可賣', '求'].includes(String(item.tradeStatus))) {
    throw new Error('狀態不正確。');
  }

  const q = Number(item.quantity);
  if (!Number.isInteger(q) || q < 1) {
    throw new Error('數量必須是 1 以上整數。');
  }

  const p = Number(item.unitPrice || 0);
  if (!Number.isFinite(p) || p < 0) {
    throw new Error('單價不可小於 0。');
  }
}

function rowToItem_(row) {
  if (!row || !row[0]) return null;

  const obj = {};
  HEADERS.forEach((h, i) => obj[h] = row[i]);

  obj.quantity = Number(obj.quantity || 0);
  obj.unitPrice = Number(obj.unitPrice || 0);
  obj.type2 = String(obj.type2 || '');
  obj.tradeStatus = String(obj.tradeStatus || '非賣');

  return obj;
}

function itemToRow_(obj) {
  return HEADERS.map(h => obj[h] ?? '');
}

function sanitizeFilename_(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 160);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
