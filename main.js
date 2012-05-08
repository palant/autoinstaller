/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

let {Prefs} = require("prefs");
let {Server} = require("server");

// Init server and make sure to react to pref changes.
Server.setPort(Prefs.serverPort);
Server.setAllowedIPs(Prefs.allowedIPs);
Prefs.addListener(function(name)
{
  if (name == "serverPort")
    Server.setPort(Prefs.serverPort);
  else if (name == "allowedIPs")
    Server.setAllowedIPs(Prefs.allowedIPs);
});
onShutdown.add(function() Server.setPort(0));

exports.installAddon = installAddon;
function installAddon(data)
{
  Cu.import("resource://gre/modules/AddonManager.jsm");

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
      onInstallFailed: function(install)
      {
        install.removeListener(this);
        Cu.reportError("Extension Auto-Install: installation failed (error " + install.error + ")");
      }
    });
    install.install();
  }, "application/x-xpinstall");
}
