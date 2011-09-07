(function () {
    const Cc = Components.classes;
    const Ci = Components.interfaces;

    const DEFAULT_RETRY_COUNT = 3;

    const modules = {};

    let util, http, gmail, Gmail;

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
    // DOM Utils
    // ============================================================ //

    function $E(name, attrs, childs) {
        let elem = document.createElement(name);

        if (attrs)
            for (let [k, v] in Iterator(attrs))
                elem.setAttribute(k, v);

        if (childs)
            for (let [, child] in Iterator(childs))
                elem.appendChild(child);

        return elem;
    }

    function createDescription(msg, attr) {
        let description = $E("label", attr);
        let textNode    = document.createTextNode(msg);

        description.appendChild(textNode);

        return description;
    }

    function createIcon(cls, tooltiptext) {
        return $E("spacer", {
            class       : "gpum-popup-icon" + " " + cls,
            tooltiptext : tooltiptext || ""
        });
    }

    // ============================================================ //
    // Initialization
    // ============================================================ //

    loadModule("util.jsm", modules);
    util = modules.util;

    loadModule("http.jsm", modules);
    http = modules.http;

    loadModule("gmail.jsm", modules);
    Gmail = modules.Gmail;

    // ============================================================ //
    // Arrange gpum
    // ============================================================ //

    window.addEventListener("load", function () {
        window.removeEventListener("load", arguments.callee, false);

        let popup          = $("gpum-popup");
        let statusbarIcon  = $("gpum-statusbar-icon");
        let statusbarCount = $("gpum-statusbar-count");

        const toolbarButtonId = "gpum-toolbar-button";
        function getToolbarButton() $(toolbarButtonId);

        let iconBox = $("gpum-statusbar-icon-box");

        if ((gmail = util.storage.gmail))
            handleUpdate();
        else
        {
            gmail = util.storage.gmail = new Gmail({
                checkAllMail : util.getBoolPref(util.getPrefKey("checkAll"), false),
                interval     : 1000 * 60 * util.getIntPref(util.getPrefKey("updateInterval"), 0)
            });

            gmail.setupScheduler();
            gmail.startScheduler(true);
        }

        updateViews();

        gmail.registerWindow(window);
        document.addEventListener(gmail.UPDATE_EVENT, handleUpdate, false);

        let unreadContainer = $E("vbox", { flex : 1 });
        popup.appendChild(unreadContainer);

        // ============================================================ //

        let title = $E("hbox", { id : "gpum-popup-title" });

        // let inboxIcon = createIcon("gpum-popup-icon-inbox");
        // title.appendChild(inboxIcon);

        let inboxLabel = createDescription("", { class : "gpum-link" });
        title.appendChild(inboxLabel);

        title.appendChild($E("spacer", { flex : 1 }));

        let composeMailIcon = createIcon("gpum-popup-icon-compose", util.getLocaleString("composeMail"));
        title.appendChild(composeMailIcon);

        composeMailIcon.addEventListener("click", function (ev) {
            if (ev.button !== 0)
                return;
            openLink(gmail.composeURL);
        }, false);

        inboxLabel.addEventListener("click", function (ev) {
            if (ev.button !== 0)
                return;
            openLink(gmail.xml.link.@href.toString());
        }, false);

        unreadContainer.appendChild(title);

        // ============================================================ //

        let scrollBox = $E("vbox", { flex : 1 });
        unreadContainer.appendChild(scrollBox);

        let (previewTitle = $('gpum-popup4preview-header-title'))
            previewTitle.addEventListener("click", function (ev) {
                if (ev.button !== 0)
                    return;
                gpum.closePreview();
                openLink(previewTitle.getAttribute("url"));

                if (typeof previewTitle.__gpumDestroy__ === "function")
                {
                    previewTitle.__gpumDestroy__();
                    previewTitle.__gpumDestroy__ = null;
                }
            }, false);

        let (iframe = $('gpum-popup4preview-frame'))
        {
            const onLocationChange = {
                QueryInterface: function (aIID) {
                    if (aIID.equals(Ci.nsIWebProgressListener)   ||
                        aIID.equals(Ci.nsISupportsWeakReference) ||
                        aIID.equals(Ci.nsISupports))
                        return onLocationChange;
                    throw Components.results.NS_NOINTERFACE;
                },

                onLocationChange: function (aProgress, aRequest, aURI) {
                    let { docShell, contentWindow } = iframe;
                    docShell.allowJavascript = docShell.allowPlugins = docShell.allowSubframes = false;
                    contentWindow.wrappedJSObject.print = contentWindow.print = function () {};
                },

                onStateChange       : function () {},
                onProgressChange    : function () {},
                onStatusChange      : function () {},
                onSecurityChange    : function () {},
                onLinkIconAvailable : function () {}
            };
            iframe.addProgressListener(onLocationChange, Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);

            iframe.addEventListener("click", function (ev) {
                let elem = ev.target;

                util.killEvent(ev);

                if (ev.button !== 0)
                    return;

                let url = getHrefByClimbling(elem, 3);
                if (url && /^(https?|ftp):\/\//.test(url))
                    openLink(url, true);
            }, true);
        };

        function getHrefByClimbling(elem, depth) {
            if (elem.localName === "a")
                return elem.href;
            if (depth > 1 && elem.parentNode)
                return getHrefByClimbling(elem.parentNode, depth - 1);
            return null;
        }

        // ============================================================ //
        // View
        // ============================================================ //

        function updateViewStatusbar({ loading, count, tooltip }) {
            if (!statusbarIcon)
                return;

            iconBox.setAttribute("tooltiptext", tooltip);
            statusbarCount.setAttribute("value",(count >= 0 && !loading) ? count : "-");

            if (loading) {
                statusbarIcon.setAttribute("src", "chrome://gpum/skin/icon16/loading.png");
            } else {
                if (count > 0)
                    statusbarIcon.setAttribute("src", "chrome://gpum/skin/icon16/gmail.png");
                else if (count === 0)
                    statusbarIcon.setAttribute("src", "chrome://gpum/skin/icon16/gmail-blue.png");
                else
                    statusbarIcon.setAttribute("src", "chrome://gpum/skin/icon16/gmail-gray.png");
            }
        }

        function updateViewToolbar({ loading, count, tooltip }) {
            let toolbarButton = getToolbarButton();
            if (!toolbarButton)
                return;

            toolbarButton.setAttribute("data-count",(count >= 0 && !loading) ? count : "-");
            toolbarButton.setAttribute("tooltiptext", tooltip);
            toolbarButton.setAttribute("data-loading", loading);
        }

        // ============================================================ //
        // Controller
        // ============================================================ //

        function handleUpdate(ev) {
            updateViews(false);
        };

        function updateViews(loading) {
            let count = gmail.unreadCount;
            let tooltip = "";

            if (count > 0)
                tooltip = util.getLocaleString("thereAreUnreadMails", [count]);
            else if (count === 0)
                tooltip = util.getLocaleString("thereAreNoUnreadMails");
            else
                tooltip = util.getLocaleString("notLoggedIn");

            let args = {
                loading : !!loading,
                count   : count,
                tooltip : tooltip
            };

            updateViewStatusbar(args);
            updateViewToolbar(args);
        }

        function openLink(url, cont) {
            if (util.getBoolPref(util.getPrefKey("alwaysUseSSL"), true))
                url = url.replace(/^http:\/\/mail\.google\.com\//, "https://mail.google.com/");
            util.visitLink(url);
            if (!cont)
                popup.hidePopup();
        }

        function appendEntry(scrollBox, unread) {
            let entry = unread.entry;

            let entryContainer = $E("vbox");

            // ============================================================ //

            let header = $E("hbox", { class : "gpum-popup-header", align : "center" });

            let author = createDescription("• " + entry.author.name, {
                class       : "gpum-popup-author gpum-link",
                tooltiptext : entry.author.email
            });
            header.appendChild(author);

            header.appendChild($E("spacer", { flex : 1 }));

            let modifiedLabel  = createDescription(unread.time.toLocaleDateString(), {
                tooltiptext : unread.time.toString()
            });
            header.appendChild(modifiedLabel);

            let actionIconContainer = $E("hbox", { class : "gpum-popup-action-icon-container", align : "center" });

            let markAsReadLink = createIcon("gpum-popup-icon-markread", util.getLocaleString("markAsReadLink"));
            let deleteLink     = createIcon("gpum-popup-icon-delete", util.getLocaleString("deleteLink"));
            let markAsSpamLink = createIcon("gpum-popup-icon-markspam", util.getLocaleString("markAsSpamLink"));
            let archiveLink    = createIcon("gpum-popup-icon-archive", util.getLocaleString("archiveLink"));

            actionIconContainer.appendChild(markAsReadLink);
            actionIconContainer.appendChild(deleteLink);
            actionIconContainer.appendChild(markAsSpamLink);
            actionIconContainer.appendChild(archiveLink);

            header.appendChild(actionIconContainer);

            entryContainer.appendChild(header);

            // ============================================================ //

            let titleContainer = $E("hbox", { class : "gpum-popup-title-container", align : "center" });

            let star = createIcon("gpum-popup-star", util.getLocaleString("addStar"));
            titleContainer.appendChild(star);

            let title = createDescription(entry.title, { class : "gpum-popup-title gpum-link" });
            titleContainer.appendChild(title);

            titleContainer.appendChild($E("spacer", { flex : 1 }));

            entryContainer.appendChild(titleContainer);

            // ============================================================ //

            let bodyContainer = $E("hbox", { align : "center" });

            let summary = createDescription(entry.summary, {
                class : "gpum-popup-summary",
                tooltiptext : util.getLocaleString("displayPreview")
            });

            bodyContainer.appendChild(summary);

            entryContainer.appendChild(bodyContainer);

            // ============================================================ //

            scrollBox.appendChild(entryContainer);

            let id = Gmail.getThreadIdFromThreadURI(entry.link.@href);

            function handleClick(ev) {
                if (ev.button !== 0)
                    return;

                let target = ev.target;

                util.killEvent(ev);

                switch (target)
                {
                case author:
                    openLink(gmail.getURLRecentFor(entry.author.email));
                    break;
                case markAsReadLink:
                    gmail.markAsReadThread(id);
                    destroy();
                    break;
                case deleteLink:
                    gmail.deleteThread(id);
                    destroy();
                    break;
                case markAsSpamLink:
                    gmail.spamThread(id);
                    destroy();
                    break;
                case archiveLink:
                    gmail.archiveThread(id);
                    destroy();
                    break;
                case star:
                    gmail.starThread(id);
                    break;
                case title:
                    let (url = entry.link.@href.toString())
                        openLink(url, !util.getBoolPref(util.getPrefKey("openLinkClosePopup"), false));
                    destroy();
                    break;
                case summary:
                    let (url = gmail.getThreadBodyURL(id))
                    {
                        let popup  = $('gpum-popup4preview');
                        let iframe = $('gpum-popup4preview-frame');
                        let title  = $('gpum-popup4preview-header-title');

                        if (title.hasChildNodes())
                            title.removeChild(title.firstChild);
                        title.appendChild(document.createTextNode(entry.title));

                        title.setAttribute("url", entry.link.@href.toString());
                        title.__gpumDestroy__ = destroy;

                        iframe.setAttribute("src", url);

                        let popupOrigin = entryContainer;

                        if (util.getBoolPref(util.getPrefKey("markAsReadOnPreview"), false))
                        {
                            gmail.markAsReadThread(id);
                            if (entryContainer.previousSibling)
                                popupOrigin = entryContainer.previousSibling;
                            else if (entryContainer.nextSibling)
                                popupOrigin = entryContainer.nextSibling;
                            else
                                popupOrigin = inboxLabel;
                            destroy();
                        }

                        // let popupPosition = util.getUnicharPref(util.getPrefKey("previewPosition"), "start_after");
                        popup.openPopup(popupOrigin, "bottomcenter topright");
                    };

                    break;
                }

                if (target !== summary)
                    gpum.closePreview();
            }

            function createTMPFile(cont, name) {
                let file = util.getSpecialDir("TmpD");
                file.appendRelativePath(name);

                if (file.exists())
                    file.remove(true);
                file.create(file.NORMAL_FILE_TYPE, 0666);

                let stream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
                stream.init(file, 2, 0200, false);

                util.message(cont);

                stream.write(cont, cont.length);
                stream.flush();
                stream.close();

                let ios  = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
                let path = ios.newFileURI(file).spec;

                return path;
            }

            function destroy() {
                gmail.removeFromUnreads(unread);
                removeNode();
            }

            function removeNode() {
                entryContainer.removeEventListener("click", handleClick, false);
                scrollBox.removeChild(entryContainer);
            }

            entryContainer.__gpumDestroy__ = removeNode;

            entryContainer.addEventListener("click", handleClick, false);
        }

        function clearEntries() {
            Array.map(scrollBox.childNodes, function (e) e.__gpumDestroy__).forEach(function (f) f && f());
        }

        let gpum = window.gpum = {
            _nowChecking: false,
            set nowChecking(v) {
                updateViews(v);
                this._nowChecking = v;
            },
            get nowChecking() this._nowChecking,

            get toolbarButtonInstalled() !!getToolbarButton(),

            installToolbarButton:
            function installToolbarButton() {
                if (this.toolbarButtonInstalled)
                    return;

                let navBar = document.getElementById("nav-bar");
                navBar.insertItem(toolbarButtonId, null, null, false);

                this.makeToolbarButtonsPersistent();
            },

            /* This method corrupts toolbar pallet system
            uninstallToolbarButton:
            function uninstallToolbarButton() {
                if (!this.toolbarButtonInstalled)
                    return;

                let toolbarButton = getToolbarButton();
                let navBar = document.getElementById("nav-bar");
                navBar.removeChild(toolbarButton);

                this.makeToolbarButtonsPersistent();
            },
             */

            makeToolbarButtonsPersistent:
            function makeToolbarButtonsPersistent() {
                let navBar = document.getElementById("nav-bar");
                navBar.setAttribute("currentset", navBar.currentSet);
                document.persist("nav-bar", "currentset");
            },

            handleNewMails:
            function handleNewMails(newMails) {
                let title = util.getLocaleString("gotMails", [newMails.length]);
                let message = newMails.map(
                    function (mail) mail.entry.title + " [" + mail.entry.author.name + "]"
                ).join("\n");

                gpum.showNotification(title, message, function () {
                    openUILinkIn(gmail.mailURL, "tab");
                });
            },

            handleNewMail:
            function handleNewMail(newMail) {
                let title = newMail.entry.title + " [" + newMail.entry.author.name + "]";
                let message = newMail.entry.summary;

                gpum.showNotification(title, message, function () {
                    openUILinkIn(newMail.entry.link.@href, "tab");
                    gmail.removeFromUnreads(newMail);
                });
            },

            showNotification:
            function showNotification(title, message, onClick) {
                util.showPopup(title, message, {
                    icon: "chrome://gpum/skin/icon64/gmail64.png",
                    clickable: typeof onClick === "function",
                    observer: {
                        observe: function (subject, topic, data) {
                            if (topic === "alertclickcallback") {
                                onClick();
                            }
                        }
                    }
                });
            },

            checkMailNow:
            function checkMailNow(next) {
                this.nowChecking = true;

                gmail.processUnreads(function (req) {
                    gpum.nowChecking = false;
                    gmail.processResponse(req);

                    if (typeof next === "function")
                        next(req);
                }, function (req) {
                    gpum.nowChecking = false;
                });
            },

            handleStatusBarIconClick:
            function handleStatusBarIconClick(ev) {
                if (this.nowChecking)
                    return;

                if (ev.button === 1)
                    return this.checkMailNow();

                if (ev.button !== 0)
                    return;

                util.killEvent(ev);

                if (gmail.unreadCount < 0)
                {
                    if (gmail.isLoggedIn)
                        this.checkMailNow();
                    else
                        this.loginWithMenu(ev);
                }
                else
                {
                    clearEntries();

                    for each (let unread in gmail.unreads)
                        appendEntry(scrollBox, unread);

                    inboxLabel.textContent = gmail.xml.title.text().toString().replace(/^Gmail - /, "");

                    popup.openPopup(ev.originalTarget, "bottomcenter topright");
                }
            },

            loginWithMenu:
            function loginWithMenu(ev) {
                let logins = Gmail.getLogins().filter(function (l) l.username && l.password);

                let popup = $E("menupopup");

                if (logins.length) {
                    for (let [, { username, password }] in Iterator(logins)) {
                        let menuItem = $E("menuitem", {
                            label : username,
                            value : password
                        });

                        popup.appendChild(menuItem);
                    }
                    popup.appendChild($E("menuseparator"));
                }

                popup.appendChild($E("menuitem", {
                    label : util.getLocaleString("openLoginPage")
                }));

                document.documentElement.appendChild(popup);

                popup.addEventListener("command", function (ev) {
                    popup.removeEventListener("command", arguments.callee, false);

                    let elem  = ev.target;

                    let username = elem.getAttribute("label");
                    let password = elem.getAttribute("value");

                    if (password)
                        gpum.login(username, password);
                    else
                        gmail.openLoginPage();
                }, false);

                popup.addEventListener("popuphidden", function (ev) {
                    popup.removeEventListener("popuphidden", arguments.callee, false);
                    document.documentElement.removeChild(popup);
                }, false);

                popup.openPopup(ev.originalTarget, "bottomcenter topright");
            },

            login:
            function login(username, password) {
                this.nowChecking = true;
                gmail.login(username, password, function () {
                    gpum.checkMailNow();
                }, function (req) {
                    gpum.nowChecking = false;
                });
            },

            logout:
            function logout() {
                this.nowChecking = true;
                gmail.logout(function () {
                    gpum.nowChecking = false;
                });
            },

            loginLogout:
            function loginLogout(ev) {
                if (gmail.unreadCount < 0) {
                    $("gpum-context-menu").hidePopup();
                    this.loginWithMenu(ev);
                }
                else
                    this.logout();
            },

            openConfig:
            function openConfig() {
                let opened = util.getWindow("Gpum:Config");

                if (opened)
                    opened.focus();
                else
                    window.openDialog("chrome://gpum/content/config.xul",
                                      "GpumConfig",
                                      "chrome,titlebar,toolbar,centerscreen,resizable,scrollbars");
            },

            updateContextMenu:
            function updateContextMenu() {
                $("gpum-menu-login-logout").setAttribute(
                    "label",
                    util.getLocaleString(gmail.unreadCount < 0 ? "login" : "logout")
                );
            },

            closePreview:
            function closePreview() {
                $('gpum-popup4preview-frame').setAttribute("src", "about:blank");
                $('gpum-popup4preview').hidePopup();
            },

            modules: modules,
            gmail: gmail
        };

        function onFirstRun(action) {
            let isFirstRun = !util.getBoolPref(util.getPrefKey("installed", false));
            if (isFirstRun) {
                util.setBoolPref(util.getPrefKey("installed"), true);
                action();
            }
        }

        onFirstRun(function () gpum.installToolbarButton());
    }, false);
})();
