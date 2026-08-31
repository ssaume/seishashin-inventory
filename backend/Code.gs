/**
 * 生寫真收藏庫 - Google Apps Script backend
 * Images: Google Drive folder
 * Metadata: Google Sheet (also stored in Google Drive)
 *
 * 1) 在 Apps Script 執行 setupStorage() 一次。
 * 2) Project Settings > Script Properties 新增：
 *      APP_SECRET = 你自己產生的一長串隨機字串
 * 3) Deploy > New deployment > Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 4) 將 /exec URL 與 APP_SECRET 填入 GitHub Pages 網站的設定視窗。
 */

const SHEET_NAME = 'photos';
const HEADERS = [
  'id', 'createdAt', 'updatedAt',
  'photoName', 'memberName', 'type',
  'quantity', 'sellable', 'unitPrice',
  'imageFileId', 'imageUrl'
];

function setupStorage() {
  const props = PropertiesService.getScriptProperties();

  let rootId = props.getProperty('ROOT_FOLDER_ID');
  let root;
  if (rootId) {
    root = DriveApp.getFolderById(rootId);
  } else {
    root = DriveApp.createFolder('生寫真網站資料');
    props.setProperty('ROOT_FOLDER_ID', root.getId());
  }

  let imageFolderId = props.getProperty('IMAGE_FOLDER_ID');
  let imageFolder;
  if (imageFolderId) {
    imageFolder = DriveApp.getFolderById(imageFolderId);
  } else {
    imageFolder = root.createFolder('images');
    props.setProperty('IMAGE_FOLDER_ID', imageFolder.getId());
  }

  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  let ss;
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

function doGet() {
  return json_({ ok: true, service: 'seishashin-inventory', message: 'Use POST API.' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Empty request body.');
    const req = JSON.parse(e.postData.contents);
    verifySecret_(req.secret);

    switch (req.action) {
      case 'ping':
        return json_({ ok: true, now: new Date().toISOString() });
      case 'list':
        return json_({ ok: true, items: listItems_() });
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
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .map(rowToItem_)
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function createItem_(item, image) {
  validateItem_(item);
  if (!image || !image.base64 || !image.mimeType) throw new Error('Image is required.');

  const props = PropertiesService.getScriptProperties();
  const imageFolderId = props.getProperty('IMAGE_FOLDER_ID');
  if (!imageFolderId) throw new Error('Image folder is not initialized.');

  const bytes = Utilities.base64Decode(image.base64);
  const filename = sanitizeFilename_(image.filename || (Utilities.getUuid() + '.jpg'));
  const blob = Utilities.newBlob(bytes, image.mimeType, filename);
  const file = DriveApp.getFolderById(imageFolderId).createFile(blob);

  // GitHub Pages 要直接顯示圖片，V1 採用「知道連結即可檢視」。
  // 若 Workspace 政策禁止公開分享，這行可能失敗；可改用後續的 private-media proxy 架構。
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
    photoName: String(item.photoName).trim(),
    memberName: String(item.memberName).trim(),
    type: String(item.type),
    quantity: Number(item.quantity),
    sellable: Boolean(item.sellable),
    unitPrice: Number(item.unitPrice || 0),
    imageFileId: file.getId(),
    imageUrl: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1200`
  };

  const sheet = getSheet_();
  sheet.appendRow(itemToRow_(created));
  return created;
}

function adjustQty_(id, quantity) {
  const qty = Number(quantity);
  if (!id || !Number.isInteger(qty) || qty < 1) throw new Error('Invalid quantity.');
  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);
  if (!rowIndex) throw new Error('Record not found.');

  const quantityCol = HEADERS.indexOf('quantity') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;
  sheet.getRange(rowIndex, quantityCol).setValue(qty);
  sheet.getRange(rowIndex, updatedAtCol).setValue(new Date().toISOString());

  return rowToItem_(sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]);
}

function deleteItem_(id) {
  if (!id) throw new Error('Missing id.');
  const sheet = getSheet_();
  const rowIndex = findRowById_(sheet, id);
  if (!rowIndex) throw new Error('Record not found.');

  const row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  const item = rowToItem_(row);
  if (item.imageFileId) {
    try { DriveApp.getFileById(item.imageFileId).setTrashed(true); }
    catch (err) { console.warn('Unable to trash image: ' + err); }
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
  if (!String(item.photoName || '').trim()) throw new Error('生寫真名為必填。');
  if (!String(item.memberName || '').trim()) throw new Error('成員名為必填。');
  if (!['全身', '半身', '大頭', '坐姿'].includes(String(item.type))) throw new Error('類型不正確。');
  const q = Number(item.quantity);
  if (!Number.isInteger(q) || q < 1) throw new Error('數量必須是 1 以上整數。');
  const p = Number(item.unitPrice || 0);
  if (!Number.isFinite(p) || p < 0) throw new Error('單價不可小於 0。');
}

function rowToItem_(row) {
  if (!row || !row[0]) return null;
  const obj = {};
  HEADERS.forEach((h, i) => obj[h] = row[i]);
  obj.quantity = Number(obj.quantity || 0);
  obj.unitPrice = Number(obj.unitPrice || 0);
  obj.sellable = obj.sellable === true || String(obj.sellable).toLowerCase() === 'true';
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
