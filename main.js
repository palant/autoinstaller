/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

let {PrefsObserver} = require("prefsObserver");

let Main = exports.Main =
{
  init: function()
  {
    require("prefLoader").loadDefaultPrefs();
    unrequire("prefLoader");

    PrefsObserver.init();
  },

  shutdown: function()
  {
    PrefsObserver.shutdown();
  },

  installAddon: function(data)
  {
    Cu.import("resource://gre/modules/AddonManager.jsm");

    let url = "data:application/x-xpinstall," + escape(data);
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
}
