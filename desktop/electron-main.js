const { app, BrowserWindow, Menu, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const REPO_ROOT = path.join(__dirname, "..");

// core/main.js and every core/ file it imports are native ES modules
// (import/export, no bundler). Chromium refuses to fetch sibling ES module
// files for a page loaded from a plain file:// URL — file:// is treated as
// an opaque "null" origin, and `type="module"` script fetches enforce CORS
// even though the browser normally exempts `file://` from that. Serving the
// same files over a registered custom scheme (instead of win.loadFile's
// file://) is Electron's documented fix.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "aimonsite",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "AimonSite Desktop",
    backgroundColor: "#f5f5f7", // matches the app's light-theme default background
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // A frameless-feeling app rather than a browser window — the game itself
  // is the entire UI, so a native menu bar (File/Edit/View/...) has nothing
  // useful to show.
  win.setMenuBarVisibility(false);
  win.loadURL("aimonsite://app/desktop/renderer/index.html");
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  protocol.handle("aimonsite", (request) => {
    const relativePath = decodeURIComponent(new URL(request.url).pathname);
    let filePath = path.normalize(path.join(REPO_ROOT, relativePath));
    if (!filePath.startsWith(REPO_ROOT)) {
      return new Response("Forbidden", { status: 403 });
    }
    // The home screen's "back to landing page" link resolves to the repo
    // root — serve its index.html the way a static host would for "/".
    try {
      if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch {
      // Missing path — let net.fetch below surface its own not-found error.
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
