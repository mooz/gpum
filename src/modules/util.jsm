/**
 * @fileOverview
 * @name util.jsm
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

const EXPORTED_SYMBOLS = ["util", "service"];

const Cc = Components.classes;
const Ci = Components.interfaces;

const PREF_ROOT = "extensions.gpum";

const util = {
    storage: {},

    lazy:
    function lazy(obj, name, f) {
        obj.__defineGetter__(name, function () {
                                 delete obj[name];
                                 return obj[name] = f();
                             });
    },

    lazyService:
    function lazyService(obj, name, id, interfc) {
        util.lazy(obj, name, function () Cc[id].getService(Ci[interfc]));
    },

    inject:
    function inject(src, dst) {
        for (let [k, v] in Iterator(src))
            dst[k] = dst[v];
        return dst;
    },

    // ============================================================ //
    // Preference
    // ============================================================ //

    getPrefKey:
    function getPrefKey(name) PREF_ROOT + "." + name,

    setPref:
    function setPref(key, value) {
        switch (typeof value)
        {
        case 'string':
            this.setUnicharPref(key, value);
            break;
        case 'number':
            this.setIntPref(key, value);
            break;
        case 'boolean':
            this.setBoolPref(key, value);
            break;
        }
    },

    setPrefs:
    function setPrefs(aPrefList) {
        for (let [key, value] in Iterator(aPrefList))
            this.setPref(key, value);
    },

    setBoolPref:
    function setBoolPref(aPrefName, aPrefValue) {
        try {
            service.prefbranch.setBoolPref(aPrefName, aPrefValue);
        } catch (e) {}
    },

    getBoolPref:
    function getBoolPref(aPrefName, aDefVal) {
        try {
            return service.prefbranch.getBoolPref(aPrefName);
        } catch (e) {
            return typeof aDefVal === "undefined" ? null : aDefVal;
        }
    },

    setUnicharPref:
    function setUnicharPref(aPrefName, aPrefValue) {
        try {
            let { ss } = service;
            ss.data = aPrefValue;
            service.prefbranch.setComplexValue(aPrefName, Ci.nsISupportsString, ss);
        } catch (e) {}
    },

    getUnicharPref:
    function getUnicharPref(aStringKey) {
        return this.getLocalizedUnicharPref(aStringKey)
            || this.copyUnicharPref(aStringKey);
    },

    copyUnicharPref:
    function copyUnicharPref(aPrefName, aDefVal) {
        try {
            return service.prefbranch.getComplexValue(aPrefName, Ci.nsISupportsString).data;
        } catch (e) {
            return typeof aDefVal === "undefined" ? null : aDefVal;
        }
    },

    setIntPref:
    function setIntPref(aPrefName, aPrefValue) {
        try {
            service.prefbranch.setIntPref(aPrefName, aPrefValue);
        } catch (e) {}
    },

    getIntPref:
    function setIntPref(aPrefName, aDefVal) {
        try {
            return service.prefbranch.getIntPref(aPrefName);
        } catch (e) {
            return typeof aDefVal === "undefined" ? null : aDefVal;
        }
    },

    getLocalizedUnicharPref:
    function getLocalizedUnicharPref(aPrefName, aDefVal) {
        try {
            return service.prefbranch.getComplexValue(aPrefName, Ci.nsIPrefLocalizedString).data;
        } catch (e) {
            return typeof aDefVal === "undefined" ? null : aDefVal;
        }
    },

    // ============================================================ //
    // i18n
    // ============================================================ //

    getLocaleString:
    function getLocaleString(key, replace) {
        try
        {
            if (replace)
                return this.stringBundle.formatStringFromName(key, replace, replace.length);
            else
                return this.stringBundle.GetStringFromName(key);
        }
        catch (e)
        {
            return key;
        }
    },

    // ============================================================ //
    // Clipboard
    // ============================================================ //

    clipboardSet:
    function clipboardSet(aText) {
        const { ss, trans, clipboard } = service;

        ss.data = aText;
        trans.addDataFlavor('text/unicode');
        trans.setTransferData('text/unicode', ss, aText.length * 2);
        clipboard.setData(trans, null, clipboard.kGlobalClipboard);
    },

    clipboardGet:
    function clipboardGet() {
        try
        {
            const { trans, clipboard } = service;

            trans.addDataFlavor("text/unicode");

            clipboard.getData(trans, clipboard.kGlobalClipboard);

            let str       = {};
            let strLength = {};

            trans.getTransferData("text/unicode", str, strLength);
            if (str)
                str = str.value.QueryInterface(Ci.nsISupportsString);

            return str ? str.data.substring(0, strLength.value / 2) : null;
        }
        catch (e)
        {
            return null;
        }
    },

    // ============================================================ //
    // Charcode
    // ============================================================ //

    convertFromUnicode:
    function convertFromUnicode(aString, aCharCode) {
        const { uconv } = service;

        try {
            uconv.charset = aCharCode;
            return uconv.ConvertFromUnicode(aString);
        } catch (e) {}
    },

    convertToUnicode:
    function convertToUnicode(aString, aCharCode) {
        const { uconv } = service;

        try {
            uconv.charset = aCharCode;
            return uconv.ConvertToUnicode(aString);
        } catch (e) {}
    },

    confirm:
    function confirm(aTitle, aMessage, aWindow) {
        let { prompts } = service;

        return prompts.confirm(aWindow || util.getWindow("navigator:browser"), aTitle, aMessage);
    },

    format:
    function format(aFormat) {
        for (let i = 1; i < arguments.length; ++i)
            aFormat = aFormat.replace("%s", arguments[i]);
        return aFormat;
    },

    log:
    function log(aMsg) {
        let { console } = service;

        try {
            console.logStringMessage(aMsg);
        } catch (e) {
            console.logStringMessage(e);
        }
    },

    message:
    function message() {
        util.log(util.format.apply(this, arguments));
    },

    messageDebug:
    function messageDebug(msg) {
        util.log(msg + " [" + new Date() + "] " + arguments.callee.caller.name + "()");
    },

    // ============================================================ //
    // Window
    // ============================================================ //

    getBrowserWindows:
    function getBrowserWindows() {
        let windows = [];

        const { wm } = service;
        const enumerator = wm.getEnumerator("navigator:browser");

        while (enumerator.hasMoreElements())
            windows.push(enumerator.getNext());

        return windows;
    },

    getWindow:
    function getWindow(aType) {
        let { wm } = service;
        return wm.getMostRecentWindow(aType);
    },

    visitLink:
    function visitLink(aURI, aBackGround) {
        let mainWindow = util.getWindow("navigator:browser");

        mainWindow.openUILinkIn(aURI, aBackGround ? "tabshifted" : "tab");
    },

    killEvent:
    function killEvent(ev) {
        ev.stopPropagation && ev.stopPropagation();
        ev.preventDefault && ev.preventDefault();
    },

    removeAllChilds:
    function removeAllChilds(elem) {
        while (elem.hasChildNodes())
            elem.removeChild(elem.firstChild);
    },

    // ============================================================ //
    //  File
    // ============================================================ //

    uriFromFile:
    function uriFromFile(file) {
        let { ios } = service;
        return ios.newFileURI(file);
    },

    uriFromSpec:
    function uriFromSpec(spec, charset, base) {
        let { ios } = service;
        return ios.newURI(spec, charset || null, base || null);
    },

    // ============================================================ //
    //  Directory
    // ============================================================ //

    getSpecialDir:
    function getSpecialDir(prop) {
        let { ds } = service;

        return ds.get(prop, Ci.nsILocalFile);
    },

    // ============================================================ //
    //  Sound
    // ============================================================ //

    playSound:
    function playSound(prop) {
        let { sound } = service;

        sound.play(util.uriFromSpec("chrome://gpum/content/sound/sexy.mp3"));
    },

    // ============================================================ //
    //  DOM
    // ============================================================ //

    htmlFromString:
    function htmlFromString(str, doc) {
        util.message("doc :: " + doc);

        let html = doc.implementation.createDocument("http://www.w3.org/1999/xhtml", "html", null),
        body = doc.createElementNS("http://www.w3.org/1999/xhtml", "body");
        html.documentElement.appendChild(body);

        body.appendChild(Cc["@mozilla.org/feed-unescapehtml;1"]
                         .getService(Ci.nsIScriptableUnescapeHTML)
                         .parseFragment(str, false, null, body));

        return html;
    },

    // ============================================================ //
    //  Notification
    // ============================================================ //

    showPopup: function (title, message, options) {
        try {
            const as = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
        } catch (x) {
            return false;
        }

        options = options || {};

        as.showAlertNotification(options.icon,
                                 title,
                                 message,
                                 !!options.clickable,
                                 options.cookie,
                                 options.observer);
        return true;
    },

    // ============================================================ //
    //  E4X
    // ============================================================ //

    createXML:
    function createXML(src) {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=336551
        src = src.replace(/^<\?xml\s+version\s*=\s*(?:"[^"]+"|'[^']+')[^?]*\?>/, "");
        return new XML(src);
    }
};

util.lazy(util, "isWindows", function () {
              let xulRuntime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
              return /windows/i.test(xulRuntime.OS);
          });

util.lazy(util, "stringBundle", function () {
              const bundleURI = "chrome://gpum/locale/gpum.properties";
              let bundleSvc = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
              return bundleSvc.createBundle(bundleURI);
          });

const service = {};

util.lazyService(service, "ds", "@mozilla.org/file/directory_service;1", "nsIProperties");
util.lazyService(service, "wm", "@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");
util.lazyService(service, "uconv", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");
util.lazyService(service, "prefbranch", "@mozilla.org/preferences-service;1", "nsIPrefBranch");
util.lazyService(service, "ss", "@mozilla.org/supports-string;1", "nsISupportsString");
util.lazyService(service, "trans", "@mozilla.org/widget/transferable;1", "nsITransferable");
util.lazyService(service, "clipboard", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
util.lazyService(service, "prompts", "@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
util.lazyService(service, "console", "@mozilla.org/consoleservice;1", "nsIConsoleService");
util.lazyService(service, "cm", "@mozilla.org/cookiemanager;1", "nsICookieManager");
util.lazyService(service, "sdr", "@mozilla.org/security/sdr;1", "nsISecretDecoderRing");
util.lazyService(service, "ios", "@mozilla.org/network/io-service;1", "nsIIOService");

util.lazy(service, "sound", function () Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound));
