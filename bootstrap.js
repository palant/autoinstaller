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
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

function install(params, reason) {}
function uninstall(params, reason) {}

function startup(params, reason)
{
  if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)
    Components.manager.addBootstrappedManifestLocation(params.installPath);

  PrefsObserver.init();
}

function shutdown(params, reason)
{
  PrefsObserver.shutdown();

  if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)
    Components.manager.removeBootstrappedManifestLocation(params.installPath);
}

function installAddon(data)
{
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
            .quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
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

var PrefsObserver =
{
  branch: "extensions.autoinstaller.",

  init: function()
  {
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
    let port = 0
    try
    {
      port = Services.prefs.getIntPref(this.branch + "serverPort");
    } catch (e) {}

    Server.setPort(port);
  },

  observe: function(subject, topic, data)
  {
    if (topic != "nsPref:changed")
      return;

    if (data == this.branch + "serverPort")
      this.updatePort();
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
};

var Server =
{
  socket: null,

  setPort: function(port)
  {
    if (this.socket && this.socket.port == port)
      return;

    if (this.socket)
    {
      try
      {
        this.socket.close();
      }
      catch (e)
      {
        Cu.reportError(e);
      }
      this.socket = null;
    }

    if (port)
    {
      try
      {
        this.socket = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
        this.socket.init(port, false, -1);
        this.socket.asyncListen(this);
      }
      catch (e)
      {
        this.socket = null;
        Cu.reportError(e);
      }
    }
  },

  onSocketAccepted: function(server, transport)
  {
    let response = "HTTP/1.1 500 No Content\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
    let responseStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
    responseStream.setData(response, response.length);
    NetUtil.asyncCopy(responseStream, transport.openOutputStream(transport.OPEN_UNBUFFERED, 0, 0));

    NetUtil.asyncFetch(transport.openInputStream(0, 0, 0), function(inputStream, result)
    {
      if (!Components.isSuccessCode(result))
      {
        Cu.reportError("Extension Auto-Installer: failed reading data from incoming connection (error code " + result.toString(16) + ")");
        return;
      }

      let binaryStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
      binaryStream.setInputStream(inputStream);

      let data = binaryStream.readBytes(binaryStream.available());
      binaryStream.close();

      if (!/\r?\n\r?\n/.test(data))
      {
        Cu.reportError("Extension Auto-Installer: data received from incoming connection doesn't seem to be an HTTP request");
        return;
      }

      data = data.replace(/[\x00-\xFF]*?\r?\n\r?\n/, "");
      if (!data.length)
      {
        Cu.reportError("Extension Auto-Installer: no POST data received from incoming connection");
        return;
      }

      installAddon(data);
    });
  },

  onStopListening: function(server, status)
  {
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIServerSocketListener])
};
