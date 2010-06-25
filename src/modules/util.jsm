/**
 * @fileOverview
 * @name util.jsm
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

const EXPORTED_SYMBOLS = ["util", "service"];

const Cc = Components.classes;
const Ci = Components.interfaces;

const PREF_ROOT = "extensions.gmml";

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

        mainWindow.gBrowser.loadOneTab(aURI, null, null, null, aBackGround || false, false);
    },

    killEvent:
    function killEvent(ev) {
        ev.stopPropagation();
        ev.preventDefault();
    },

    removeAllChilds:
    function removeAllChilds(elem) {
        while (elem.hasChildNodes())
            elem.removeChild(elem.firstChild);
    },

    createXML:
    function createXML(src) {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=336551
        src = src.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, "");
        return new XML(src);
    }
};

const service = {};

util.lazyService(service, "wm", "@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");
util.lazyService(service, "uconv", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");
util.lazyService(service, "prefbranch", "@mozilla.org/preferences-service;1", "nsIPrefBranch");
util.lazyService(service, "ss", "@mozilla.org/supports-string;1", "nsISupportsString");
util.lazyService(service, "trans", "@mozilla.org/widget/transferable;1", "nsITransferable");
util.lazyService(service, "clipboard", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
util.lazyService(service, "prompts", "@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
util.lazyService(service, "console", "@mozilla.org/consoleservice;1", "nsIConsoleService");
