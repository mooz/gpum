/**
 * @fileOverview Gmail mapper class
 * @name gmail.js
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 * @requires util.jsm
 * @requires http.jsm
 * @requires ISO8601DateUtils.jsm
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

loadModule("resource://gre/modules/ISO8601DateUtils.jsm");

function Gmail(args) {
    args = args || {};

    const protocol = args.protocol || "https://";
    const base     = "mail.google.com";

    let mailURL = protocol + base + (args.domain ? "/a/" + args.domain + "/" : "/mail/");

    this.checkAllMail = args.checkAllMail;

    // export
    this.username = args.username;
    this.password = args.password;

    this.mailURL = mailURL;

    this.unreads = [];

    this.registeredWindows  = [];
    this.timer              = null;
    this.timerEvent         = null;
    this._schedulerInterval = args.interval || this.SCHEDULER_INTERVAL_MIN;

    this.unreadCount = -1;
}

Gmail.prototype = {
    get checkAllMail() this._checkAllMail || false,
    set checkAllMail(v) {
        util.message("v is " + v);

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

    getURLRecentFor:
    function getURLRecentFor(addr) {
        let query = encodeURIComponent(util.format("from:(%s)+OR+to:(%s)", addr, addr));

        return this.mailURL + "#search/" + query;
    },

    processUnreads:
    function processUnreads(callback, onerror) {
        const self = this;

        let (reqURL = this.mailURL + "feed/atom" + this.atomLabel)
        {
            util.message("reqURL : " + reqURL);
            http.get(reqURL,
                     function (req) {
                         if (req.status === 200)
                             callback(req);
                         else
                             onerror(req);
                     }, null,
                     {
                         header   : { "Content-type" : "application/xml" },
                         username : self.username,
                         password : self.password
                     });
        };
    },

    post:
    function post(args, next) {
        const self = this;

        function refreshAtCode() {
            self.getAt(function () { self.post(args, next); });
        }

        if (!self.gmailAt)
            refreshAtCode();
        else
        {
            let threadID = args.threadID;
            let action   = args.action;

            let postURL = this.simpleModeURL.replace("^http:", "https:");

            http.post(postURL, function (req) {
                          if (req.status !== 200)
                              refreshAtCode();
                          else if (typeof next === "function") next(req);
                      },
                      {
                          t   : threadID,
                          at  : self.gmailAt,
                          act : action
                      });
        }
    },

    getAt:
    function getAt(callback) {
        const self = this;

        let getURL = this.simpleModeURL + "?ui=html&zy=c";

        http.get(getURL, function (req) {
                     let matches = req.responseText.match(/\?at=([^"]+)/);

                     if (matches && matches.length > 0)
                     {
                         self.gmailAt = matches[1];

                         if (typeof callback === "function")
                             callback();
                     }
                 });
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
                 });
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
        let xml = util.createXML(src);

        this.updateUnreads(xml);
        this.dispatchEvents(this.registeredWindows);

        this.xml = xml;
    },

    updater:
    function updater() {
        const self = this;

        self.processUnreads(
            function (req) {
                self.processResponse(req);
            },
            function (req) {
                util.messageDebug("UPDATE ERROR => " + req.responseText);
            }
        );
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

        self.unreadCount = Number(xml.fullcount);

        self.updatedUnreads = [];
        self.unreads        = [];

        for each (let entry in xml.entry)
        {
            let id = entry.id.toString();

            // if (self.unreads.some(function (senior) id === senior.entry.id.toString()))
            //     continue;

            let modified = ISO8601DateUtils.parse(entry.modified.toString());
            let unread   = { entry : entry, time : modified };

            self.unreads.push(unread);

            // let unreads = self.unreads;
            // let len     = unreads.length;

            // if (len > 0)
            // {
            //     for (let i = 0; i < len; ++i)
            //     {
            //         if (modified >= unreads[i].time)
            //         {
            //             unreads.splice(i, 0, unread);
            //             self.updatedUnreads.push(unread);
            //             break;
            //         }
            //         else if (i === len - 1)
            //             unreads.push(unread), self.updatedUnreads.push(unread);
            //     }
            // }
            // else
            //     unreads.push(unread), self.updatedUnreads.push(unread);
        }
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

            util.message("send " + this.UPDATE_EVENT);

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

    login:
    function login() {
    },

    openLoginPage:
    function openLoginPage() {
        util.visitLink(this.mailURL);
    },

    logout:
    function logout(next) {
        let self = this;

        http.get(this.mailURL + "?logout", function (req) {
                     self.unreads     = [];
                     self.unreadCount = -1;
                     self.dispatchEvents(self.registeredWindows);

                     if (typeof next === "function") next(req);
                 });
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
