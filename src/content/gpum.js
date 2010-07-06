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

     function setAttributes(aElem, aAttributes) {
         if (aAttributes)
             for (let [key, value] in Iterator(aAttributes))
                 if (key && value)
                     aElem.setAttribute(key, value);
     }

     function genElem(aName, aAttributes) {
         let elem = document.createElement(aName);
         setAttributes(elem, aAttributes);
         return elem;
     }

     function createDescription(msg, attr) {
         let description = genElem("label", attr);
         let textNode    = document.createTextNode(msg);

         description.appendChild(textNode);

         return description;
     }

     function createIcon(cls, tooltiptext) {
         return genElem("spacer", { class       : "gpum-popup-icon" + " " + cls,
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

     window.addEventListener(
         "load", function () {
             window.removeEventListener("load", arguments.callee, false);

             let popup = $("gpum-popup");
             let icon  = $("gpum-statusbar-icon");
             let count = $("gpum-statusbar-count");

             if ((gmail = util.storage.gmail))
             {
                 handleUpdate();
             }
             else
             {
                 gmail = util.storage.gmail = new Gmail(
                     {
                         checkAllMail : util.getBoolPref(util.getPrefKey("checkAll"), false),
                         interval     : 1000 * 60 * util.getIntPref(util.getPrefKey("updateInterval"), 0)
                     }
                 );

                 gmail.setupScheduler();
                 gmail.startScheduler(true);
             }

             gmail.registerWindow(window);
             document.addEventListener(gmail.UPDATE_EVENT, handleUpdate, false);

             let unreadContainer = genElem("vbox", { flex : 1 });
             popup.appendChild(unreadContainer);

             // ============================================================ //

             let title = genElem("hbox", { id : "gpum-popup-title" });

             // let inboxIcon = createIcon("gpum-popup-icon-inbox");
             // title.appendChild(inboxIcon);

             let inboxLabel = createDescription("", { class : "gpum-link" });
             title.appendChild(inboxLabel);

             title.appendChild(genElem("spacer", { flex : 1 }));

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

             let scrollBox = genElem("vbox", { flex : 1 });
             unreadContainer.appendChild(scrollBox);

             function handleUpdate(ev) {
                 updateStatusbarCount();
             }

             function openLink(url, cont) {
                 util.visitLink(url);
                 if (!cont)
                     popup.hidePopup();
             }

             function updateStatusbarCount() {
                 let unreadCount = gmail.unreadCount;

                 count.setAttribute("value", unreadCount >= 0 ? unreadCount : "-");
                 refreshIconColor();
             }

             function refreshIconColor() {
                 if (gmail.unreadCount > 0)
                     icon.setAttribute("src", "chrome://gpum/skin/icon16/gmail.png");
                 else
                     icon.setAttribute("src", "chrome://gpum/skin/icon16/gmail-blue.png");
             }

             function refreshStatusbarIcon(loading) {
                 if (loading)
                 {
                     icon.setAttribute("src", "chrome://gpum/skin/icon16/loading.png");
                     count.setAttribute("value", "-");
                 }
                 else
                     updateStatusbarCount();
             }

             function appendEntry(scrollBox, unread) {
                 let entry = unread.entry;

                 let entryContainer = genElem("vbox");

                 // ============================================================ //

                 let header = genElem("hbox", { class : "gpum-popup-header", align : "center" });

                 let author = createDescription("• " + entry.author.name, {
                                                    class       : "gpum-popup-author gpum-link",
                                                    tooltiptext : entry.author.email
                                                });
                 header.appendChild(author);

                 header.appendChild(genElem("spacer", { flex : 1 }));

                 let modifiedLabel  = createDescription(unread.time.toLocaleDateString(), {
                                                            tooltiptext : unread.time.toString()
                                                        });
                 header.appendChild(modifiedLabel);

                 let actionIconContainer = genElem("hbox", { class : "gpum-popup-action-icon-container", align : "center" });

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

                 let titleContainer = genElem("hbox", { class : "gpum-popup-title-container", align : "center" });

                 let star = createIcon("gpum-popup-star", util.getLocaleString("addStar"));
                 titleContainer.appendChild(star);

                 let title = createDescription(entry.title, { class : "gpum-popup-title gpum-link" });
                 titleContainer.appendChild(title);

                 titleContainer.appendChild(genElem("spacer", { flex : 1 }));

                 entryContainer.appendChild(titleContainer);

                 // ============================================================ //

                 let bodyContainer = genElem("hbox", { align : "center" });

                 let summary = createDescription(entry.summary, { class : "gpum-popup-summary" });

                 bodyContainer.appendChild(summary);

                 entryContainer.appendChild(bodyContainer);

                 // ============================================================ //

                 scrollBox.appendChild(entryContainer);

                 let id = entry.link.@href.toString().replace(/.*message_id=([\d\w]+).*/, "$1");

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
                         gmail.getThreadBody(id, function (id, str) {
                                                 // let path = createTMPFile(str, "gpum_msg_body.html");

                                                 // let frame = genElem("iframe", { src : path, type : "content", flex : 1 });

                                                 // bodyContainer.parentNode.insertBefore(frame, bodyContainer);
                                             });
                         break;
                     }
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

                     // if (scrollBox.childNodes.length < 1)
                     // {
                     //     gpum.checkMailNow(function () {
                     //                           if (gmail.unreads.length)
                     //                               gpum.handleStatusBarIconClick({ button : 0 });
                     //                       });
                     // }
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

             window.gpum = {
                 _nowChecking: false,
                 set nowChecking(v) {
                     refreshStatusbarIcon(v);
                     this._nowChecking = v;
                 },
                 get nowChecking() this._nowChecking,

                 checkMailNow:
                 function checkMailNow(next) {
                     const self = this;

                     this.nowChecking = true;

                     gmail.processUnreads(
                         function (req) {
                             self.nowChecking = false;
                             gmail.processResponse(req);

                             if (typeof next === "function")
                                 next(req);
                         },
                         function (req) {
                             self.nowChecking = false;
                         }
                     );
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
                         gmail.openLoginPage();
                     else
                     {
                         clearEntries();

                         for each (let unread in gmail.unreads)
                             appendEntry(scrollBox, unread);

                         inboxLabel.textContent = gmail.xml.title.text().toString().replace(/^Gmail - /, "");

                         popup.openPopup(icon, "start_after", 0, 0, false, false);
                     }
                 },

                 loginLogout:
                 function loginLogout() {
                     if (gmail.unreadCount < 0)
                         gmail.openLoginPage();
                     else
                         gmail.logout();
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
                     $("gpum-menu-login-logout").setAttribute("label", gmail.unreadCount < 0 ? "Login" : "Logout");
                 },

                 modules: modules
             };
         }, false);
 })();
