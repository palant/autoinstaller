/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});
Services.strings.flushBundles();
let bundle = Services.strings.createBundle("chrome://autoinstaller/locale/messages.properties");

function getMessage(name, ...params)
{
  if (name instanceof Array)
    return getMessage(...name);

  let string = bundle.GetStringFromName(name);
  if (params.length)
    string = string.replace(/\{(\d+)\}/g, match => params[match[1]]);
  return string;
}

exports.getMessage = getMessage;
