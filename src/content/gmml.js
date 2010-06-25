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
         let path = "resource://gmml-modules/" + name;

         try {
             if (name.lastIndexOf(".jsm") !== -1)
                 Components.utils.import(path, context);
             else
                 loadScript(path, context);
         } catch (x) {}
     }

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
         let description = genElem("description", attr);
         let textNode    = document.createTextNode(msg);

         description.appendChild(textNode);

         return description;
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

     window.addEventListener(
         "load", function () {
             window.removeEventListener("load", arguments.callee, false);

             let popup = $("gmml-popup");
             let icon  = $("gmml-statusbar-icon");
             let count = $("gmml-statusbar-count");

             if ((gmail = util.storage.gmail))
             {
                 handleUpdate();
             }
             else
             {
                 gmail = util.storage.gmail = new Gmail();

                 gmail.setupScheduler();
                 gmail.startScheduler(true);
             }

             gmail.registerWindow(window);
             document.addEventListener(gmail.UPDATE_EVENT, handleUpdate, false);

             function handleUpdate() {
                 let unreadCount = gmail.unreadCount;

                 count.setAttribute("value", unreadCount);
                 setIconStatus();
             }

             function setIconStatus() {
                 if (gmail.unreadCount > 0)
                     icon.setAttribute("src", "chrome://gmml/skin/icon16/gmail.png");
                 else
                     icon.setAttribute("src", "chrome://gmml/skin/icon16/gmail-blue.png");
             }

             function appendEntry(cont, ent) {
                 let container = genElem("vbox");

                 container.__gmmlTagID__ = ent.id;

                 // ============================================================ //

                 let header = genElem("hbox", { id : "gmml-popup-header", align : "center" });

                 let author = createDescription("• " + ent.author.name, {
                                                    id          : "gmml-popup-author",
                                                    tooltiptext : ent.author.email,
                                                    class       : "gmml-link"
                                                });
                 header.appendChild(author);

                 header.appendChild(genElem("spacer", { flex : 1 }));

                 let markAsReadLink = createDescription(util.getLocaleString("markAsReadLink"), { class : "gmml-link" });
                 let deleteLink     = createDescription(util.getLocaleString("deleteLink"), { class : "gmml-link" });
                 let markAsSpamLink = createDescription(util.getLocaleString("markAsSpamLink"), { class : "gmml-link" });
                 let archiveLink    = createDescription(util.getLocaleString("archiveLink"), { class : "gmml-link" });

                 header.appendChild(markAsReadLink);
                 header.appendChild(deleteLink);
                 header.appendChild(markAsSpamLink);
                 header.appendChild(archiveLink);

                 container.appendChild(header);

                 // ============================================================ //

                 let titleContainer = genElem("hbox", { id : "gmml-popup-title-container", align : "center" });

                 let star = genElem("spacer", { id : "gmml-popup-star", class : "gmml-popup-icon",
                                                tooltiptext : util.getLocaleString("addStar") });
                 titleContainer.appendChild(star);

                 let title = createDescription(ent.title, { id: "gmml-popup-title", class : "gmml-link" });
                 titleContainer.appendChild(title);

                 container.appendChild(titleContainer);

                 // ============================================================ //

                 let body = genElem("hbox", { align : "center" });

                 body.appendChild(createDescription(ent.summary));

                 container.appendChild(body);

                 // ============================================================ //

                 cont.appendChild(container);

                 let id = ent.link.@href.toString().replace(/.*message_id=([\d\w]+).*/, "$1");

                 function openLink(url) {
                     util.visitLink(url);
                     popup.hidePopup();
                 }

                 function handleClick(ev) {
                     if (ev.button !== 0)
                         return;

                     let target = ev.target;

                     switch (target)
                     {
                     case author:
                         openLink(gmail.getURLRecentFor(ent.author.email));
                         break;
                     case markAsReadLink:
                         gmail.markAsReadThread(id);
                         destruct();
                         break;
                     case deleteLink:
                         gmail.deleteThread(id);
                         destruct();
                         break;
                     case markAsSpamLink:
                         gmail.spamThread(id);
                         destruct();
                         break;
                     case archiveLink:
                         gmail.archiveThread(id);
                         destruct();
                         break;
                     case star:
                         gmail.starThread(id);
                         break;
                     case title:
                         openLink(ent.link.@href.toString());
                         destruct();
                         break;
                     case body:
                         break;
                     }
                 }

                 function destruct() {
                     container.removeEventListener("click", handleClick, false);
                     gmail.removeFromUnreads(ent);
                     cont.removeChild(container);
                 }

                 container.addEventListener("click", handleClick, false);
             }

             function clearEntries() {
                 util.removeAllChilds(popup);
             }

             window.gmml = {
                 handleStatusBarIconClick:
                 function handleStatusBarIconClick(ev) {
                     if (ev.button !== 0)
                         return;

                     util.killEvent(ev);

                     clearEntries();
                     let cont = genElem("vbox", { flex : 1 });
                     for each (let ent in gmail.unreads)
                         appendEntry(cont, ent);
                     popup.appendChild(cont);

                     popup.openPopup(icon, "start_after", 0, 0, false, false);
                 },

                 modules: modules
             };
         }, false);
 })();
