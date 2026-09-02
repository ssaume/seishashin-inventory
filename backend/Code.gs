/**
 * 生寫真收藏庫 V5.5 - Google Apps Script backend
 *
 * 圖片：Google Drive / images
 * 屬性：Google Sheet
 *
 * V5：V4 + 狀態即時維護 + 預約交換/購買 + 可用數量
 *
 * schema:
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
  'imageFileId', 'imageUrl',
  'reservedExchange', 'reservedPurchase'
];
const LIST_CACHE_KEY = 'photos_list_v5_3';
const LIST_CACHE_SECONDS = 120;

const CSV_HEADERS = [
  'ID', '建立時間', '更新時間',
  '生寫真系列', '成員名',
  '類型1', '類型2',
  '數量', '狀態', '單價',
  '圖片File ID', '圖片URL',
  '預約交換', '預約購買'
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
    service: 'seishashin-inventory-v4',
    message: 'Use POST API.'
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Empty request body.');
    }

    const req = JSON.parse(e.postData.contents);

    // 唯讀分享端點：不使用 APP_SECRET，只驗證獨立的 SHARE_TOKEN。
    if (req.action === 'publicList') {
      verifyShareToken_(req.shareToken);
      return json_({ ok: true, items: publicItems_() });
    }

    // 其餘皆為管理功能，必須通過 APP_SECRET。
    verifySecret_(req.secret);

    switch (req.action) {
      case 'ping':
        return json_({ ok: true, now: new Date().toISOString() });

      case 'list':
        return json_({ ok: true, items: listItems_() });

      case 'exportData':
        return json_({ ok: true, items: listItems_() });

      case 'getShareInfo':
        return json_({ ok: true, ...getShareInfo_() });

      case 'rotateShareToken':
        return json_({ ok: true, ...rotateShareToken_() });

      case 'revokeShareToken':
        revokeShareToken_();
        return json_({ ok: true });

      case 'replaceAll': {
        const result = replaceAllItems_(req.items || []);
        return json_({ ok: true, ...result });
      }

      case 'create':
        return json_({
          ok: true,
          item: createItemIdempotent_(req.item, req.image, req.uploadToken)
        });

      case 'adjustQty':
        return json_({ ok: true, item: adjustQty_(req.id, req.quantity) });

      case 'updateType':
        return json_({ ok: true, item: updateType_(req.id, req.type) });

      case 'updatePrice':
        return json_({ ok: true, item: updatePrice_(req.id, req.unitPrice) });

      case 'updateStatus':
        return json_({ ok: true, item: updateStatus_(req.id, req.tradeStatus) });

      case 'adjustReservation':
        return json_({ ok: true, item: adjustReservation_(req.id, req.reservationType, req.delta) });

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

function verifyShareToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('SHARE_TOKEN');
  if (!expected || !token || String(token) !== String(expected)) {
    throw new Error('分享連結無效或已失效。');
  }
}

function getShareInfo_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('SHARE_TOKEN') || '';
  return {
    enabled: Boolean(token),
    token: token,
    createdAt: props.getProperty('SHARE_CREATED_AT') || ''
  };
}

function rotateShareToken_() {
  const props = PropertiesService.getScriptProperties();
  const token = (
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '')
  );
  const createdAt = new Date().toISOString();
  props.setProperty('SHARE_TOKEN', token);
  props.setProperty('SHARE_CREATED_AT', createdAt);
  return { token: token, createdAt: createdAt };
}

function revokeShareToken_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('SHARE_TOKEN');
  props.deleteProperty('SHARE_CREATED_AT');
}

function publicItems_() {
  return listItems_().map(item => ({
    seriesName: item.seriesName,
    memberName: item.memberName,
    type: item.type,
    type2: item.type2,
    quantity: item.quantity,
    tradeStatus: item.tradeStatus,
    unitPrice: item.unitPrice,
    imageUrl: item.imageUrl,
    reservedExchange: item.reservedExchange,
    reservedPurchase: item.reservedPurchase,
    availableQuantity: Math.max(
      0,
      Number(item.quantity || 0) -
      Number(item.reservedExchange || 0) -
      Number(item.reservedPurchase || 0)
    )
  }));
}

function getSheet_() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!id) {
    throw new Error('Storage is not initialized. Run setupStorage() first.');
  }

  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Metadata sheet is missing.');
  }

  ensureCompatibleSchema_(sheet);
  return sheet;
}

function ensureCompatibleSchema_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(v => String(v || '').trim());

  if (currentHeaders.join('|') === HEADERS.join('|')) {
    return;
  }

  const recognized = detectSchema_(currentHeaders);

  if (!recognized) {
    throw new Error(
      '無法辨識目前 photos 工作表欄位。請先執行 migrateToV5()；若仍失敗，請確認第一列欄位名稱。'
    );
  }

  migrateSheetToV5_(sheet, currentHeaders);
}

function detectSchema_(headers) {
  const set = new Set(headers.filter(Boolean));

  if (set.has('seriesName') && set.has('tradeStatus')) {
    return 'V2_OR_LATER';
  }

  if (set.has('photoName') && set.has('sellable')) {
    return 'V1';
  }

  if (set.has('seriesName') && set.has('sellable')) {
    return 'TRANSITIONAL';
  }

  return null;
}

function migrateToV5() {
  const id = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!id) {
    throw new Error('Storage is not initialized. Run setupStorage() first.');
  }

  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Metadata sheet is missing.');
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    Logger.log('V5 schema created on empty sheet.');
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(v => String(v || '').trim());

  if (currentHeaders.join('|') === HEADERS.join('|')) {
    normalizeReservationColumns_(sheet);
    Logger.log('Already V5. Reservation columns normalized.');
    return;
  }

  const recognized = detectSchema_(currentHeaders);

  if (!recognized) {
    throw new Error(
      '無法辨識目前 photos 工作表欄位。請確認第一列是否包含 seriesName/photoName、memberName、type、quantity 等既有欄位。'
    );
  }

  migrateSheetToV5_(sheet, currentHeaders);
  Logger.log('Migration complete: ' + recognized + ' -> V5');
}

function migrateSheetToV5_(sheet, oldHeaders) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const oldLastRow = sheet.getLastRow();
    const oldLastCol = sheet.getLastColumn();

    const oldData = oldLastRow > 1
      ? sheet.getRange(2, 1, oldLastRow - 1, oldLastCol).getValues()
      : [];

    backupRawSheetBeforeMigration_(oldHeaders, oldData);

    const idx = {};
    oldHeaders.forEach((header, i) => {
      if (header) idx[header] = i;
    });

    const migratedRows = oldData
      .filter(row => {
        const idValue =
          getOldValue_(row, idx, 'id') ||
          getOldValue_(row, idx, 'seriesName') ||
          getOldValue_(row, idx, 'photoName') ||
          getOldValue_(row, idx, 'memberName');

        return String(idValue || '').trim() !== '';
      })
      .map(row => {
        const sellableRaw = getOldValue_(row, idx, 'sellable');
        const normalizedSellable =
          sellableRaw === true ||
          String(sellableRaw).toLowerCase() === 'true';

        const quantity = toNonNegativeInteger_(
          getOldValue_(row, idx, 'quantity'),
          0
        );

        const reservedExchange = toNonNegativeInteger_(
          getOldValue_(row, idx, 'reservedExchange'),
          0
        );

        const reservedPurchase = toNonNegativeInteger_(
          getOldValue_(row, idx, 'reservedPurchase'),
          0
        );

        let safeReservedExchange = reservedExchange;
        let safeReservedPurchase = reservedPurchase;

        if (safeReservedExchange + safeReservedPurchase > quantity) {
          safeReservedExchange = 0;
          safeReservedPurchase = 0;
        }

        const tradeStatus =
          String(getOldValue_(row, idx, 'tradeStatus') || '').trim() ||
          (normalizedSellable ? '可賣' : '非賣');

        return [
          String(getOldValue_(row, idx, 'id') || Utilities.getUuid()),
          normalizeDateValue_(getOldValue_(row, idx, 'createdAt')),
          normalizeDateValue_(getOldValue_(row, idx, 'updatedAt')),
          String(
            getOldValue_(row, idx, 'seriesName') ||
            getOldValue_(row, idx, 'photoName') ||
            ''
          ).trim(),
          String(getOldValue_(row, idx, 'memberName') || '').trim(),
          String(getOldValue_(row, idx, 'type') || '').trim(),
          String(getOldValue_(row, idx, 'type2') || '').trim(),
          quantity,
          ['非賣', '可換', '可賣', '求'].includes(tradeStatus)
            ? tradeStatus
            : '非賣',
          Number(getOldValue_(row, idx, 'unitPrice') || 0),
          String(getOldValue_(row, idx, 'imageFileId') || '').trim(),
          String(getOldValue_(row, idx, 'imageUrl') || '').trim(),
          safeReservedExchange,
          safeReservedPurchase
        ];
      });

    const backupValues = sheet
      .getRange(1, 1, oldLastRow, oldLastCol)
      .getValues();

    try {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

      if (migratedRows.length > 0) {
        sheet
          .getRange(2, 1, migratedRows.length, HEADERS.length)
          .setValues(migratedRows);
      }

      sheet.setFrozenRows(1);
      invalidateListCache_();
    } catch (err) {
      sheet.clearContents();
      sheet
        .getRange(1, 1, backupValues.length, backupValues[0].length)
        .setValues(backupValues);
      throw err;
    }
  } finally {
    lock.releaseLock();
  }
}

function backupRawSheetBeforeMigration_(headers, rows) {
  const props = PropertiesService.getScriptProperties();
  const rootFolderId = props.getProperty('ROOT_FOLDER_ID');

  if (!rootFolderId) {
    throw new Error('ROOT_FOLDER_ID is missing.');
  }

  const root = DriveApp.getFolderById(rootFolderId);

  let backupFolder;
  const folders = root.getFoldersByName('backups');

  if (folders.hasNext()) {
    backupFolder = folders.next();
  } else {
    backupFolder = root.createFolder('backups');
  }

  const allRows = [headers].concat(rows);
  const csv = '\uFEFF' + allRows
    .map(row => row.map(csvEscape_).join(','))
    .join('\r\n');

  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Taipei',
    'yyyyMMdd_HHmmss'
  );

  backupFolder.createFile(
    'V5升級前備份_' + stamp + '.csv',
    csv,
    MimeType.CSV
  );
}

function normalizeReservationColumns_(sheet) {
  if (sheet.getLastRow() <= 1) return;

  const rowCount = sheet.getLastRow() - 1;
  const exCol = HEADERS.indexOf('reservedExchange') + 1;
  const buyCol = HEADERS.indexOf('reservedPurchase') + 1;

  const exValues = sheet.getRange(2, exCol, rowCount, 1).getValues();
  const buyValues = sheet.getRange(2, buyCol, rowCount, 1).getValues();

  exValues.forEach(row => {
    row[0] = toNonNegativeInteger_(row[0], 0);
  });

  buyValues.forEach(row => {
    row[0] = toNonNegativeInteger_(row[0], 0);
  });

  sheet.getRange(2, exCol, rowCount, 1).setValues(exValues);
  sheet.getRange(2, buyCol, rowCount, 1).setValues(buyValues);
}

function getOldValue_(row, idx, field) {
  return idx[field] !== undefined ? row[idx[field]] : '';
}

function toNonNegativeInteger_(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function normalizeDateValue_(value) {
  if (!value) return new Date().toISOString();

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.toISOString();
  }

  return String(value);
}


function listItems_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(LIST_CACHE_KEY);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      cache.remove(LIST_CACHE_KEY);
    }
  }

  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    cache.put(LIST_CACHE_KEY, '[]', LIST_CACHE_SECONDS);
    return [];
  }

  const items = sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .map(rowToItem_)
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  try {
    const json = JSON.stringify(items);
    if (json.length < 90000) {
      cache.put(LIST_CACHE_KEY, json, LIST_CACHE_SECONDS);
    }
  } catch (err) {
    console.warn('List cache skipped: ' + err);
  }

  return items;
}

function invalidateListCache_() {
  try {
    CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  } catch (err) {
    console.warn('Unable to clear list cache: ' + err);
  }
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
      imageUrl: String(item.imageUrl || '').trim(),
      reservedExchange: Number(item.reservedExchange || 0),
      reservedPurchase: Number(item.reservedPurchase || 0)
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

    invalidateListCache_();

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

function createItemIdempotent_(item, image, uploadToken) {
  const token = String(uploadToken || '').trim();

  // 舊版前端沒有 token 時仍相容。
  if (!token) {
    return createItem_(item, image);
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'upload_' + token;
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      cache.remove(cacheKey);
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(70000);

  try {
    // 等待 lock 後再次確認，避免手機重試造成重複新增。
    const cachedAfterLock = cache.get(cacheKey);
    if (cachedAfterLock) {
      return JSON.parse(cachedAfterLock);
    }

    const created = createItem_(item, image);

    try {
      cache.put(cacheKey, JSON.stringify(created), 600);
    } catch (err) {
      console.warn('Unable to cache upload token: ' + err);
    }

    return created;
  } finally {
    lock.releaseLock();
  }
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

  // Base64 約比原始檔大 33%；手機端已壓縮，這裡再做合理上限保護。
  if (String(image.base64).length > 2 * 1024 * 1024) {
    throw new Error('圖片仍然過大，請重新選擇或稍後再試。');
  }

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
    imageUrl: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1200`,
    reservedExchange: 0,
    reservedPurchase: 0
  };

  getSheet_().appendRow(itemToRow_(created));
  invalidateListCache_();
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

  const current = rowToItem_(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );

  const reservedTotal =
    Number(current.reservedExchange || 0) +
    Number(current.reservedPurchase || 0);

  if (qty < reservedTotal) {
    throw new Error('在庫數量不可低於已預約總數 ' + reservedTotal + '。');
  }

  const quantityCol = HEADERS.indexOf('quantity') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;

  sheet.getRange(rowIndex, quantityCol).setValue(qty);
  sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

  invalidateListCache_();

  return rowToItem_(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );
}

function updateType_(id, type) {
  if (!id) throw new Error('Missing id.');

  const allowed = ['全身', '半身', '大頭', '坐姿'];
  if (!allowed.includes(String(type))) {
    throw new Error('類型1不正確。');
  }

  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);

  if (!rowIndex) {
    throw new Error('Record not found.');
  }

  const typeCol = HEADERS.indexOf('type') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;

  sheet.getRange(rowIndex, typeCol).setValue(String(type));
  sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

  invalidateListCache_();

  return rowToItem_(
    sheet
      .getRange(rowIndex, 1, 1, HEADERS.length)
      .getValues()[0]
  );
}

function updatePrice_(id, unitPrice) {
  if (!id) throw new Error('Missing id.');

  const price = Number(unitPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('單價不可小於 0。');
  }

  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);

  if (!rowIndex) {
    throw new Error('Record not found.');
  }

  const priceCol = HEADERS.indexOf('unitPrice') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;

  sheet.getRange(rowIndex, priceCol).setValue(price);
  sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

  invalidateListCache_();

  return rowToItem_(
    sheet
      .getRange(rowIndex, 1, 1, HEADERS.length)
      .getValues()[0]
  );
}

function updateStatus_(id, tradeStatus) {
  if (!id) throw new Error('Missing id.');
  if (!['非賣', '可換', '可賣', '求'].includes(String(tradeStatus))) {
    throw new Error('狀態不正確。');
  }

  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);
  if (!rowIndex) throw new Error('Record not found.');

  const statusCol = HEADERS.indexOf('tradeStatus') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;

  sheet.getRange(rowIndex, statusCol).setValue(String(tradeStatus));
  sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

  invalidateListCache_();

  return rowToItem_(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );
}

function adjustReservation_(id, reservationType, delta) {
  if (!id) throw new Error('Missing id.');

  const change = Number(delta);
  if (![1, -1].includes(change)) {
    throw new Error('Reservation delta must be +1 or -1.');
  }

  const field = reservationType === 'exchange'
    ? 'reservedExchange'
    : reservationType === 'purchase'
      ? 'reservedPurchase'
      : '';

  if (!field) {
    throw new Error('Reservation type must be exchange or purchase.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();
    const rowIndex = findRowById_(sheet, id);
    if (!rowIndex) throw new Error('Record not found.');

    const item = rowToItem_(
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
    );

    const current = Number(item[field] || 0);
    const next = current + change;

    if (next < 0) {
      throw new Error('預約數量不可小於 0。');
    }

    const otherField = field === 'reservedExchange'
      ? 'reservedPurchase'
      : 'reservedExchange';

    const newReservedTotal = next + Number(item[otherField] || 0);

    if (newReservedTotal > Number(item.quantity || 0)) {
      throw new Error('目前沒有可用庫存可新增預約。');
    }

    const reservationCol = HEADERS.indexOf(field) + 1;
    const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;

    sheet.getRange(rowIndex, reservationCol).setValue(next);
    sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

    invalidateListCache_();

    return rowToItem_(
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
    );
  } finally {
    lock.releaseLock();
  }
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
  invalidateListCache_();
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

  const reservedExchange = Number(item.reservedExchange || 0);
  const reservedPurchase = Number(item.reservedPurchase || 0);

  if (!Number.isInteger(reservedExchange) || reservedExchange < 0) {
    throw new Error('預約交換必須為 0 以上整數。');
  }

  if (!Number.isInteger(reservedPurchase) || reservedPurchase < 0) {
    throw new Error('預約購買必須為 0 以上整數。');
  }

  if (reservedExchange + reservedPurchase > q) {
    throw new Error('預約總數不可大於在庫數量。');
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
  obj.reservedExchange = Math.max(0, Number(obj.reservedExchange || 0));
  obj.reservedPurchase = Math.max(0, Number(obj.reservedPurchase || 0));
  obj.availableQuantity = Math.max(
    0,
    obj.quantity - obj.reservedExchange - obj.reservedPurchase
  );

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
