/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

let Server = exports.Server =
{
  socket: null,
  allowedIPs: null,

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

  setAllowedIPs: function(string)
  {
    this.allowedIPs = {};
    let ips = string.split(/[\s,]+/);
    for (let i = 0; i < ips.length; i++)
      if (ips[i])
        this.allowedIPs[ips[i]] = true;
  },

  onSocketAccepted: function(server, transport)
  {
    if (!(transport.host in this.allowedIPs))
    {
      Cu.reportError("Extension Auto-Installer: connection attempt from " + transport.host + " rejected, not in the list of allowed IP addresses.");
      transport.close(Cr.NS_ERROR_FAILURE);
      return;
    }

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

      require("main").installAddon(data);
    });
  },

  onStopListening: function(server, status)
  {
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIServerSocketListener])
};
