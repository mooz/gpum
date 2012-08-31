/**
 * @fileOverview Gmail mapper class
 * @name gmail.js
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 * @requires util.jsm
 * @requires http.jsm
 */

const EXPORTED_SYMBOLS = ["Gmail"];

const Cc = Components.classes;
const Ci = Components.interfaces;

function loadScript(path, context) {
    Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader).loadSubScript(path, context);
}

function loadModule(name, context) {
    context = context || this;

    let path = name.indexOf("://") >= 0 ? name : "resource://gpum-modules/" + name;

    try {
        if (name.lastIndexOf(".jsm") !== -1)
            Components.utils.import(path, context);
        else
            loadScript(path, context);
    } catch (x) {}
}

loadModule("util.jsm");
loadModule("http.jsm");
loadModule("dom-accessor.jsm");

function Gmail(args) {
    args = args || {};

    const protocol = args.protocol || "https://";
    const base     = "mail.google.com";

    let mailURL = protocol + base + (args.domain ? "/a/" + args.domain + "/" : "/mail/") + "u/0/";

    this.checkAllMail = args.checkAllMail;

    // export
    this.username = args.username;
    this.password = args.password;

    this.mailURL = mailURL;

    this.unreads = [];
    this.newMailsHandlers = [];

    this.registeredWindows  = [];
    this.timer              = null;
    this.timerEvent         = null;
    this._schedulerInterval = args.interval || this.SCHEDULER_INTERVAL_MIN;

    this.unreadCount = -1;

    if (!args.suppressDefaultMailHandler)
        this.setupDefaultNewMailHandler();
}

Gmail.prototype = {
    get cmgr() Cc["@mozilla.org/cookiemanager;1"].getService().QueryInterface(Ci.nsICookieManager),
    get cookies() {
        // TODO: cache this
        let iter = this.cmgr.enumerator;
        let cookies = [];

        while (iter.hasMoreElements()) {
            let cookie = iter.getNext();
            if (cookie instanceof Ci.nsICookie &&
                /mail\.google\.com$/.test(cookie.host))
                cookies.push(cookie);
        }

        return cookies;
    },
    get cookie() {
        let gx = this.cookies
            .filter(function (cookie) cookie.name === "GX" && !util.isCookieExpired(cookie))
            .reduce(function (recent, gx) (!recent ? gx :
                                           recent.expires < gx.expires ? gx : recent),
                    null);
        if (!gx)
            return null;

        return 'GX="' + gx.value + '";';
    },
    get isLoggedIn() !!this.cookie,
    // get gmailAt() this.cookies.reduce(function (at, cand) {
    //     return at ? at :
    //         cand.name === "GMAIL_AT" ? cand.value : at;
    // }, null),
    get checkAllMail() this._checkAllMail || false,
    set checkAllMail(v) {
        if (v)
        {
            this.inboxLabel  = "#all";
            this.unreadLabel = "#search/l:unread";
            this.atomLabel   = "unread";
        }
        else
        {
            this.inboxLabel  = "#inbox";
            this.unreadLabel = "#inbox";
            this.atomLabel   = "";
        }
    },

    get composeURL() this.mailURL + "#compose",
    get contacsURL() this.mailURL + "#contacts",
    get simpleModeURL() this.mailURL + "h/" + ~~(1000000 * Math.random()) + "/",
    get loginURL() "https://www.google.com/accounts/ServiceLogin?service=mail",
    get authURL() "https://www.google.com/accounts/ServiceLoginAuth",
    get atomURL() this.mailURL + "feed/atom" + this.atomLabel,

    getURLRecentFor:
    function getURLRecentFor(addr) {
        let query = encodeURIComponent(util.format("from:(%s)+OR+to:(%s)", addr, addr));

        return this.mailURL + "#search/" + query;
    },

    processUnreads:
    function processUnreads(callback, onerror) {
        const self = this;

        http.get(this.atomURL, function (req) {
            if (req.status === 200)
                callback(req);
            else
                onerror(req);
        }, null, {
            header : {
                "Content-type" : "application/xml",
                "Cookie"       : this.cookie
            },
            username : self.username,
            password : self.password
        });
    },

    post:
    function post(args, next) {
        let threadID = args.threadID;
        let action   = args.action;

        let postURL = this.simpleModeURL.replace("^http:", "https:");

        let self = this;
        function doPost() {
            http.post(postURL, function (req) {
                if (req.status === 200) {
                    if (typeof next === "function") next(req);
                } else {
                    self.getAt(doPost);
                }
            }, {
                t   : threadID,
                at  : self.gmailAt,
                act : action
            }, { header : { "Cookie" : self.cookie } });
        }

        if (this.gmailAt)
            doPost();
        else
            this.getAt(doPost);
    },

    getAt:
    function getAt(callback) {
        const self = this;

        let getURL = this.simpleModeURL + "?ui=html&zy=c";

        http.get(getURL, function (req) {
            let matches = req.responseText.match(/[^a-zA-Z0-9]at=([^"]+)/);

            if (matches && matches.length > 0) {
                self.gmailAt = matches[1];

                if (typeof callback === "function")
                    callback();
            }
        }, {}, { header : { "Cookie" : this.cookie } });
    },

    // ============================================================ //
    // Actions
    // ============================================================ //

    markAsReadThread:
    function markAsReadThread(threadID, next) {
        this.post({ "threadID" : threadID, "action" : "rd" }, next);
    },

    markAsUnReadThread:
    function markAsUnReadThread(threadID, next) {
        this.post({ "threadID" : threadID, "action" : "ur" }, next);
    },

    archiveThread:
    function archiveThread(threadID, next) {
        this.post({ "threadID" : threadID, "action" : "arch" }, next);
    },

    deleteThread:
    function deleteThread(threadID, next) {
        const self = this;

        self.post({ "threadID" : threadID, "action" : "rd" }, function () {
            self.post({ "threadID" : threadID, "action" : "tr" }, next);
        });
    },

    spamThread:
    function spamThread(threadID, next) {
        this.post({ "threadID" : threadID, "action" : "sp" }, next);
    },

    starThread:
    function spamThread(threadID, next) {
        this.post({ "threadID" : threadID, "action" : "st" }, next);
    },

    getThreadBody:
    function getThreadBody(threadID, next) {
        const self = this;

        let getURL = this.simpleModeURL + "?v=pt&th=" + threadID;

        http.get(getURL, function (req) {
            if (typeof next === "function")
                next(threadID, req.responseText);
        }, {}, { header : { "Cookie" : this.cookie } });
    },

    getThreadBodyURL:
    function getThreadBodyURL(threadID) this.simpleModeURL + "?v=pt&th=" + threadID,

    // ============================================================ //
    // Scheduler
    // ============================================================ //

    get SCHEDULER_INTERVAL_MIN() 120 * 1000, // 2 minutes
    get UPDATE_EVENT() "GpumUpdateEvent",

    set schedulerInterval(value) {
        if (this.timer)
            this.stopScheduler();
        this._schedulerInterval = Math.max(~~value, this.SCHEDULER_INTERVAL_MIN);
        this.startScheduler();
    },

    get schedulerInterval() this._schedulerInterval,

    processResponse:
    function processResponse(req) {
        let src = req.responseText;
        src = src.replace(/xmlns="[^"]*"/, "");
        let xml = new DOMAccessor(util.createXML(src));

        this.updateUnreads(xml);
        this.dispatchEvents(this.registeredWindows);

        this.xml = xml;
    },

    updater:
    function updater() {
        const self = this;

        if (this.isLoggedIn) {
            self.processUnreads(function (req) {
                self.processResponse(req);
            }, function (req) {
                util.messageDebug("UPDATE ERROR => " + req.responseText);
            });
        } else {
            // not logged in
            this.resetLoginStatus();
        }
    },

    setupScheduler:
    function setupScheduler() {
        const self = this;

        if (this.timer)
            return;

        this.timerEvent = {
            notify: function () { self.updater(); }
        };

        this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    },

    startScheduler:
    function startScheduler(immediate) {
        this.timer.initWithCallback(this.timerEvent,
                                    this.schedulerInterval,
                                    Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
        if (immediate)
            this.updater();
    },

    stopScheduler:
    function stopScheduler() {
        this.timer.cancel();
    },

    updateUnreads:
    function updateUnreads(xml) {
        const self = this;

        let entries = xml.selectAll("entry");

        self.unreadCount = Math.max(
            Number(xml.select("fullcount").text),
            entries.length
        );

        let knownMails = { __proto__ : null };
        self.unreads.forEach(function (unread) knownMails[unread.id] = true);
        self.unreads = [];

        let newMails = [];

        entries.forEach(function (entry) {
            let id = entry.select("id").text;
            let modified = util.parseISO8601(entry.select("modified").text);
            let unread   = { entry : entry, time : modified, id : id };

            self.unreads.push(unread);

            if (!knownMails[id])
                newMails.push(unread);
        }, this);

        this.newMailsHandlers.forEach(function (handler) {
            try {
                handler(newMails);
            } catch ([]) {}
        }, this);
    },

    setupDefaultNewMailHandler:
    function setupDefaultNewMailHandler() {
        let self = this;

        self.firstTime = true;
        this.addNewMailHandler(function (newMails) {
            let isFirstTime = self.firstTime;
            self.firstTime = false;

            if (isFirstTime && util.getBoolPref(util.getPrefKey("dontNotifyOnStartup"), true))
                return;

            let browserWindows = util.getBrowserWindows().filter(function (win) win.gpum);
            if (!browserWindows.length)
                return;

            let win = browserWindows[0];
            let { gpum } = win;

            if (!util.getBoolPref(util.getPrefKey("showNewMailsNotification"), true))
                return;

            gpum.handleNewMails(newMails);
        });
    },

    addNewMailHandler:
    function addNewMailHandler(handler) {
        if (this.newMailsHandlers.indexOf(handler) < 0)
            this.newMailsHandlers.push(handler);
    },

    removeNewMailHandler:
    function removeNewMailHandler(handler) {
        let handlerIndex = this.newMailsHandlers.indexOf(handler);
        if (handlerIndex >= 0)
            this.newMailsHandlers.splice(handlerIndex, 1);
    },

    removeFromUnreads:
    function removeFromUnreads(unread) {
        let pos;

        if ((pos = this.unreads.indexOf(unread)) >= 0)
        {
            this.unreads.splice(pos, 1);
            this.unreadCount--;

            this.dispatchEvents(this.registeredWindows);
        }
    },

    dispatchEvents:
    function dispatchEvents(windows) {
        for (let [, win] in Iterator(windows))
        {
            let doc = win.document;
            let ev  = doc.createEvent("Events");

            ev.initEvent(this.UPDATE_EVENT, true, false);
            doc.dispatchEvent(ev);
        }
    },

    registerWindow:
    function registerWindow(win) {
        const self = this;

        if (this.registeredWindows.indexOf(win) === -1)
        {
            this.registeredWindows.push(win);

            win.addEventListener("unload", function () {
                let pos = self.registeredWindows.indexOf(win);

                if (pos >= 0)
                    self.registeredWindows.splice(pos, 1);
            }, false);
        }
    },

    // ============================================================ //
    // Login, Logout
    // ============================================================ //

    resetLoginStatus:
    function resetLoginStatus() {
        this.unreads     = [];
        this.unreadCount = -1;
        this.gmailAt     = null;
        this.dispatchEvents(this.registeredWindows);
    },

    login:
    function login(mail, pass, next, error) {
        let self = this;

        this.getLoginInfoThen(function (params) {
            params.Email = mail;
            params.Passwd = pass;
            params.PersistentCookie = "yes";

            // authenticate
            http.post(self.authURL, function (req) {
                if (req.status === 200)
                    http.get(self.simpleModeURL, function (req) { // get cookie
                        self.gmailAt = null;
                        if (typeof next === "function") next(req);
                    });
                else
                    if (typeof error === "function") error(req);
            }, params);
        });
    },

    logout:
    function logout(next) {
        let self = this;

        http.get(this.mailURL + "?logout", function (req) {
            self.resetLoginStatus();
            try {
                let { cmgr } = self;
                self.cookies
                    .filter(function (cookie) cookie.name === "GX")
                    .forEach(function (cookie) {
                        cmgr.remove(cookie.host, cookie.name, cookie.path, false);
                    });
            } catch (x) {
                util.message("Failed to remove cookie :: " + e);
            }
            if (typeof next === "function") next(req);
        });
    },

    getLoginInfoThen:
    function getLoginInfoThen(next) {
        if (!this.registeredWindows.length)
            throw "No window is registered.";

        let doc = this.registeredWindows[0].document;

        http.get(this.loginURL, function (req) {
            let str = req.responseText;
            let html = util.htmlFromString(str, doc);
            let params = ["#service",
                          "#dsh",
                          "#timeStmp",
                          "#secTok",
                          "input[name=GALX]",
                          "#Email",
                          "#Passwd",
                          "input[name=rmShown]"]
                .map(function (s) html.querySelector(s))
                .filter(function (e) e)
                .reduce(function (params, e) {
                    params[e.getAttribute("name")] = e.getAttribute("value");
                    return params;
                }, {});

            next(params);
        });
    },

    openLoginPage:
    function openLoginPage() {
        util.visitLink(this.mailURL);
    },

    // ============================================================ //
    // For preview
    // ============================================================ //

    getThreadPageURL: function (threadID) {
        return this.mailURL + "?shva=1#all/" + threadID;
    },

    // XXX
    internalKeyPattern: /var\s+GLOBALS\s*=\s*\[(?:.*?,){8}"(.*?)"/,
    parseInternalKey: function (page) {
        return page.match(this.internalKeyPattern) ?
            RegExp.$1 : null;
    },

    getInternalKeyAnd: function (threadID, next) {
        let url = this.getThreadPageURL(threadID);
        let onProgressGiven = typeof onProgress === "function";

        let self = this;
        http.get(url, function (req) {
            if (req.status === 200) {
                var internalKey = self.parseInternalKey(req.responseText);
                if (typeof next === "function")
                    next(internalKey);
            }
        });
        // {
        //     requestAdvice: function (req) {
        //         if (onProgressGiven) {
        //             req.addEventListener("progress", function (ev) {
        //                 onProgress(ev.position / ev.totalSize);
        //             }, false);
        //         }
        // }
    },

    getPrintPageURLFor: function (threadID, internalKey) {
        var pringPageURL = this.mailURL + "?ui=2&view=pt&search=all"
                + "&th=" + threadID;
        if (internalKey)
            pringPageURL += "&ik=" + internalKey;
        return pringPageURL;
    },

    getPrintPageURLAnd: function (threadID, next) {
        next(this.getPrintPageURLFor(threadID));
    }
};

// ============================================================ //
// Class member
// ============================================================ //

Gmail.getLogins = function getLogins() {
    let lm     = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
    let urls   = ["http://www.google.com", "https://www.google.com"];
    let logins = urls.reduce(function (accum, url) accum.concat(lm.findLogins({}, url, url, null) || []), []);

    return logins;
};

Gmail.getThreadIdFromThreadURI = function (uri) {
    return uri.toString().replace(/.*message_id=([\d\w]+).*/, "$1");
};
