//
// By placing this file in wakeWebhookPlugin/modules_meshcore/overrideWake.js,
// MeshCentral will load it in place of the core sendWakeOnLan() function.
//

module.exports = function (parent) {
    // 1) Grab whatever plugin settings the administrator saved under "wakeWebhook"
    //    in meshcentral-data/config.json → "plugins": { "wakeWebhook": { … } }.
    //
    //    MeshCentral exposes the entire server config under parent.parent.server.config.
    //
    let pluginSettings = {};
    try {
      pluginSettings = parent.parent.server.config.plugins.wakeWebhook || {};
    } catch (e) {
      parent.debug("wakeWebhook: no plugin settings found, using defaults");
    }
  
    // 2) Pull in host/port/path from those settings (falling back to empty strings if not set).
    const WEBHOOK_HOST = pluginSettings.host || "";
    const WEBHOOK_PORT = pluginSettings.port || 0;
    const WEBHOOK_PATH = pluginSettings.path || "";
  
    // 3) Override the built-in sendWakeOnLan(hexMac) method
    parent.sendWakeOnLan = function (hexMac) {
      try {
        // 3a) Find the “vmName” (device hostname) from the agent context
        let vmName = "<unknown-device>";
        if (parent.agent && parent.agent.DeviceName) {
          vmName = parent.agent.DeviceName;
        } else if (parent.name) {
          vmName = parent.name;
        }
  
        // 3b) Build the JSON payload
        const payload = JSON.stringify({
          vmName: vmName,
          action: "start"
        });
  
        // 3c) If the admin has not set host/port/path yet, bail out:
        if (!WEBHOOK_HOST || !WEBHOOK_PORT || !WEBHOOK_PATH) {
          parent.debug("wakeWebhook: plugin settings incomplete, aborting webhook");
          return 0;
        }
  
        // 3d) Choose HTTP or HTTPS based on port
        const useHttps = (WEBHOOK_PORT === 443);
        const httpLib  = useHttps ? require("https") : require("http");
  
        const requestOptions = {
          hostname: WEBHOOK_HOST,
          port:     WEBHOOK_PORT,
          path:     WEBHOOK_PATH,
          method:   "POST",
          headers: {
            "Content-Type":   "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        };
  
        // 3e) Send the POST
        const req = httpLib.request(requestOptions, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            parent.debug(`wakeWebhook: HTTP ${res.statusCode} → ${body}`);
          });
        });
        req.on("error", (err) => {
          parent.debug("wakeWebhook: HTTP request error: " + err.message);
        });
        req.write(payload);
        req.end();
  
        // Return 1 so MeshCentral knows “we did something” (just as the core would return the
        // number of interfaces it broadcast on). Returning 0 might cause MeshCentral to fall
        // back to its own WOL logic.
        return 1;
      } catch (e) {
        parent.debug("wakeWebhook: Exception: " + e.toString());
        return 0;
      }
    };
  };
  