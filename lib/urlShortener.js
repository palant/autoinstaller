/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let handler =
{
  classDescription: "install-shortener: protocol handler",
  get contractID()
  {
    return "@mozilla.org/network/protocol;1?name=" + this.scheme
  },
  classID: Components.ID("{6886f820-98f9-11e1-a8b0-0800200c9a66}"),

  init: function()
  {
    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.registerFactory(this.classID, this.classDescription, this.contractID, this);
    onShutdown.add((function()
    {
      registrar.unregisterFactory(this.classID, this);
    }).bind(this));
  },

  getShortURL: function(url)
  {
    return this.scheme + ":" + (this.urls.push(url) - 1);
  },

  createInstance: function(outer, iid)
  {
    if (outer)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },

  urls: [],
  scheme: "install-shortener",
  defaultPort: -1,
  protocolFlags:
      Ci.nsIProtocolHandler.URI_NORELATIVE |
      Ci.nsIProtocolHandler.URI_NOAUTH |
      Ci.nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
      Ci.nsIProtocolHandler.URI_NON_PERSISTABLE |
      Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE,

  newURI: function(spec, originCharset, baseURI)
  {
    let uri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(Ci.nsIURI);
    uri.spec = spec;
    return uri;
  },

  newChannel: function(uri)
  {
    return this.newChannel2(uri, null);
  },

  newChannel2: function(uri, loadInfo)
  {
    if (!/^\d+$/.test(uri.path))
      throw Cr.NS_ERROR_FAILURE;

    let index = parseInt(uri.path, 10);
    let result = this.urls[index];
    if (typeof result == "undefined")
      throw Cr.NS_ERROR_FAILURE;

    delete this.urls[index];
    result = Services.io.newURI(result, null, null);

    let channel;
    if (loadInfo)
      channel = Services.io.newChannelFromURIWithLoadInfo(result, loadInfo);
    else
      channel = Services.io.newChannelFromURI(result);
    channel.originalURI = uri;
    return channel;
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolHandler, Ci.nsIFactory])
};

handler.init();

exports.getShortURL = handler.getShortURL.bind(handler);
