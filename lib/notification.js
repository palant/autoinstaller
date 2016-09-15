/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});

function display(text, action)
{
  return new Promise((resolve, reject) =>
  {
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

exports.display = display;
