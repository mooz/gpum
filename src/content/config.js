(function () {
     const Cc = Components.classes;
     const Ci = Components.interfaces;

     const modules = {};

     let util;

     function $(id) document.getElementById(id);

     function loadScript(path, context) {
         Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader).loadSubScript(path, context);
     }

     function loadModule(name, context) {
         let path = "resource://gpum-modules/" + name;

         try {
             if (name.lastIndexOf(".jsm") !== -1)
                 Components.utils.import(path, context);
             else
                 loadScript(path, context);
         } catch (x) {}
     }

     // ============================================================ //
     // Initialization
     // ============================================================ //

     loadModule("util.jsm", modules);
     util = modules.util;

     let gmail = util.storage.gmail;

     let updateInterval       = $("config.updateInterval");
     let alwaysUseSSL         = $("config.alwaysUseSSL");
     let checkAll             = $("config.checkAll");
     // let useSimpleModeForLink = $("config.useSimpleModeForLink");
     let openLinkClosePopup   = $("config.openLinkClosePopup");

     window.gpumConfig = {
         onFinish:
         function onFinish(canceled) {
             if (canceled && util.isWindows)
                 return true;

             gmail.schedulerInterval = 1000 * 60 * ~~updateInterval.value;
             gmail.checkAllMail      = checkAll.checked;
             gmail.alwaysUseSSL      = alwaysUseSSL.checked;

             return true;
         },

         visitLink:
         function visitLink(elem) {
             util.visitLink(elem.getAttribute("url"));
         }
     };
 })();
