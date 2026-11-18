// Karim & Danya · guest album receiver
// Deploy as a Web app: Execute as "Me", Who has access "Anyone".
// The album page asks this script for an upload session; the guest's phone then sends the file
// straight into the album folder on this Google Drive. Files of any size are supported.

var FOLDER_NAME = "Karim & Danya · Guest Album";
var ALLOWED_ORIGINS = ["https://kazaazh.github.io"];

// Run once by hand: creates the album folder and asks for the Drive permission.
function setup() {
  var f = albumFolder_();
  Logger.log("Album folder: " + f.getUrl());
  return f.getUrl();
}

function albumFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, service: "Karim & Danya guest album" });
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.action === "start") return json_(start_(d));
    if (d.action === "chunk") return json_(chunk_(d));
    return json_({ ok: false, error: "unknown action" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Opens a resumable upload session for one file in the album folder and returns its address.
function start_(d) {
  var mime = String(d.mimeType || "");
  if (!/^(image|video)\//.test(mime)) return { ok: false, error: "only photos and videos" };
  var size = Number(d.size || 0);
  if (!(size > 0)) return { ok: false, error: "empty file" };
  var name = String(d.name || "upload").replace(/[\\\/:*?"<>|\x00-\x1f]+/g, " ").slice(0, 120);
  var origin = ALLOWED_ORIGINS.indexOf(String(d.origin)) >= 0 ? String(d.origin) : ALLOWED_ORIGINS[0];
  var res = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      "X-Upload-Content-Type": mime,
      "X-Upload-Content-Length": String(size),
      Origin: origin
    },
    payload: JSON.stringify({ name: name, parents: [albumFolder_().getId()] }),
    muteHttpExceptions: true
  });
  var h = res.getAllHeaders();
  var url = h["Location"] || h["location"];
  if (res.getResponseCode() !== 200 || !url) return { ok: false, error: "session " + res.getResponseCode() };
  return { ok: true, url: url };
}

// Fallback when a phone cannot reach Drive directly: forwards one piece of the file.
function chunk_(d) {
  var url = String(d.url || "");
  if (url.indexOf("https://www.googleapis.com/upload/drive/") !== 0) return { ok: false, error: "bad session" };
  var bytes = Utilities.base64Decode(String(d.data || ""));
  var offset = Number(d.offset), end = Number(d.end), total = Number(d.total);
  if (bytes.length !== end - offset) return { ok: false, error: "piece size" };
  var res = UrlFetchApp.fetch(url, {
    method: "put",
    headers: { "Content-Range": "bytes " + offset + "-" + (end - 1) + "/" + total },
    payload: bytes,
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  return { ok: code === 200 || code === 201 || code === 308, status: code };
}
