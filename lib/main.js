/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

let {Prefs} = require("prefs");
let {Server} = require("server");
let notification = require("notification");

// Init server and make sure to react to pref changes.
let server = new Server(Prefs.serverPort, Prefs.allowedIPs, installAddon);

Prefs.addListener(function(name)
{
  if (name == "serverPort")
    server.setPort(Prefs.serverPort);
  else if (name == "allowedIPs")
    server.setAllowedIPs(Prefs.allowedIPs);
});
onShutdown.add(() => server.setPort(0));

function installAddon(data)
{
  let {AddonManager} = Cu.import("resource://gre/modules/AddonManager.jsm", {});

  // Addon manager stores the source URL in the database. Use custom protocol
  // to "shorten" these URLs, otherwise the database will get big and slow.
  let url = require("urlShortener").getShortURL("data:application/x-xpinstall," + escape(data));
  AddonManager.getInstallForURL(url, function(install)
  {
    install.addListener({
      onInstallEnded: function(install, addon)
      {
        install.removeListener(this);

        if (addon.pendingOperations)
        {
          // Need to restart browser
          Cc["@mozilla.org/toolkit/app-startup;1"]
            .getService(Ci.nsIAppStartup)
            .quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
        }
      },
      onDownloadFailed: function(install)
      {
        install.removeListener(this);
        if (install.error == AddonManager.ERROR_SIGNEDSTATE_REQUIRED)
        {
          notification.display("unsigned_error", "unsigned_action").then(installAsTemporary =>
          {
            if (installAsTemporary)
              installTemporaryAddon(data);
          });
        }
        else
          notification.display(["download_error", install.error]);
      },
      onInstallFailed: function(install)
      {
        install.removeListener(this);
        notification.display(["installation_error", install.error]);
      }
    });
    install.install();
  }, "application/x-xpinstall");
}

function installTemporaryAddon(data)
{
  let {AddonManager} = Cu.import("resource://gre/modules/AddonManager.jsm", {});
  let {FileUtils} = Cu.import("resource://gre/modules/FileUtils.jsm", {});
  let {OS} = Cu.import("resource://gre/modules/osfile.jsm", {});
  let {AsyncShutdown} = Cu.import("resource://gre/modules/AsyncShutdown.jsm", {});

  let temppath = null;
  OS.File.openUnique(OS.Path.join(OS.Constants.Path.tmpDir, "ai-temp.xpi")).then(({file, path}) =>
  {
    temppath = path;
    let buffer = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++)
      buffer[i] = data.charCodeAt(i);
    return file.write(buffer).then(bytes => file);
  }).then(file =>
  {
    return file.close();
  }).then(() =>
  {
    return AddonManager.installTemporaryAddon(new FileUtils.File(temppath));
  }).then(() =>
  {
    // We are leaking this cleanup handler on purpose, it needs to stay around
    // even if Auto-Installer is updated.
    AsyncShutdown.profileChangeTeardown.addBlocker(
      "Extension Auto-Installer: remove temporary file " + Math.random() + Date.now(),
      () => OS.File.remove(temppath).catch(e => {})
    );
  }).catch(e =>
  {
    Cu.reportError(e);
    notification.display(["tempinstall_error", e]);
    return temppath ? OS.File.remove(temppath).catch(e => {}) : undefined;
  });
}
