/**
 * @fileOverview Http request
 * @name http.js
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

const EXPORTED_SYMBOLS = ["http"];

const Cc = Components.classes;
const Ci = Components.interfaces;

function loadScript(path, context) {
    Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader).loadSubScript(path, context);
}

function loadModule(name, context) {
    context = context || this;

    let path = "resource://gpum-modules/" + name;

    try {
        if (name.lastIndexOf(".jsm") !== -1)
            Components.utils.import(path, context);
        else
            loadScript(path, context);
    } catch (x) {}
}

loadModule("util.jsm");

const http = {
    set window(value) this._window = value,
    get window() this._window,

    params:
    function params(prm) {
        let pt = typeof prm;

        if (prm && pt === "object")
            prm = [k + "=" + v for ([k, v] in Iterator(prm))].join("&");
        else if (pt !== "string")
            prm = "";

        return prm;
    },

    request:
    function request(method, url, callback, params, opts) {
        opts = opts || {};

        let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
        req.QueryInterface(Ci.nsIXMLHttpRequest);

        const async = (typeof callback === "function");

        if (async)
            req.onreadystatechange = function () { if (req.readyState === 4) callback(req); };

        req.open(method, url, async, opts.username, opts.password);

        if (opts.raw)
            req.overrideMimeType('text/plain; charset=x-user-defined');

        for (let [name, value] in Iterator(opts.header || {}))
            req.setRequestHeader(name, value);

        req.send(params || null);

        return async ? void 0 : req;
    },

    requestXHR:
    function requestXHR(method, url, callback, params, opts) {
        opts = opts || {};

        let xhr = new this.window.XMLHttpRequest();
        xhr.mozBackgroundRequest = true;

        const async = (typeof callback === "function");

        if (async)
            xhr.onreadystatechange = function () { if (xhr.readyState === 4) callback(xhr); };

        xhr.open(method, url, async);

        if (opts.raw)
            xhr.overrideMimeType('text/plain; charset=x-user-defined');

        for (let [name, value] in Iterator(opts.header || {}))
            xhr.setRequestHeader(name, value);

        xhr.send(params || null);

        return async ? void 0 : xhr;
    },

    get:
    function get(url, callback, params, opts) {
        params = this.params(params);
        if (params)
            url += "?" + params;

        return this.request("GET", url, callback, null, opts);
    },

    post:
    function post(url, callback, params, opts) {
        params = this.params(params);

        opts = opts || {};
        opts.header = {
            "Content-type"   : "application/x-www-form-urlencoded",
            "Content-length" : params.length,
            "Connection"     : "close"
        };

        return this.request("POST", url, callback, params, opts);
    }
};
