/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let {Server} = require("server");

let PrefsObserver = exports.PrefsObserver =
{
  branch: "extensions.autoinstaller.",

  init: function()
  {
    this.updateIPs();
    this.updatePort();

    Services.prefs.addObserver(this.branch, this, true);
  },

  shutdown: function()
  {
    Services.prefs.removeObserver(this.branch, this);

    Server.setPort(0);
  },

  updatePort: function()
  {
    let port = 0;
    try
    {
      port = Services.prefs.getIntPref(this.branch + "serverPort");
    } catch (e) {}

    Server.setPort(port);
  },

  updateIPs: function()
  {
    let ips = "127.0.0.1";
    try
    {
      ips = Services.prefs.getCharPref(this.branch + "allowedIPs");
    } catch (e) {}

    Server.setAllowedIPs(ips);
  },

  observe: function(subject, topic, data)
  {
    if (topic != "nsPref:changed")
      return;

    if (data == this.branch + "serverPort")
      this.updatePort();
    if (data == this.branch + "allowedIPs")
      this.updateIPs();
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
};
