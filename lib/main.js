/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

let {Prefs} = require("prefs");
let {Server} = require("server");

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

function displayMessage(text, action)
{
  return new Promise((resolve, reject) =>
  {
    let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});

    let window = Services.wm.getMostRecentWindow("navigator:browser");
    if (window && window.PopupNotifications && window.PopupNotifications.show &&
        window.gBrowser && window.gBrowser.selectedBrowser)
    {
      let browser = window.gBrowser.selectedBrowser;
      let button = null;
      if (action)
      {
        button = {
          label: action,
          accessKey: action[0],
          callback: () => resolve(true)
        };
      }
      window.PopupNotifications.show(browser, "autoinstaller-notification", text, null, button, null, {
        persistence: 1000,
        removeOnDismissal: true,
        displayURI: {hostPort: "Extension Auto-Installer"},
        eventCallback: state => state == "removed" && resolve(false)
      });
    }
    else
    {
      try
      {
        let alertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
        alertsService.showAlertNotification(null, "Extension Auto-Installer", text, true, null, {
          observe: (subject, topic, data) =>
          {
            if (topic == "alertclickcallback")
              resolve(true);
            else if (topic == "alertfinished")
              resolve(false);
          }
        }, "autoinstaller-notification");
      }
      catch (e)
      {
        Cu.reportError(e);
        Cu.reportError("Extension Auto-Installer failed to display notification: " + text);
        resolve(false);
      }
    }
  });
}

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
          displayMessage(
            "Installation failed due to signing requirements. Install as a temporary unsigned add-on?",
            "Install as temporary add-on"
          ).then(installAsTemporary =>
          {
            if (installAsTemporary)
              installTemporaryAddon(data);
          });
        }
        else
          displayMessage("Add-on download failed (error code " + install.error + ").");
      },
      onInstallFailed: function(install)
      {
        install.removeListener(this);
        displayMessage("Add-on installation failed (error code " + install.error + ").");
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
    Cu.reportError("Extension Auto-Installer failed installing temporary add-on: " + e);
    return temppath ? OS.File.remove(temppath).catch(e => {}) : undefined;
  });
}
