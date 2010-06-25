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

     function appendEntry(cont, ent) {
         let container = genElem("vbox");

         // ============================================================ //

         let header = genElem("hbox", { class : "gmml-popup-header"});

         // author name
         header.appendChild(createDescription("• " + ent.author.name, {
                                                  class       : "gmml-popup-author",
                                                  tooltiptext : ent.author.email
                                              }));

         container.appendChild(header);

         container.appendChild(genElem("spacer"), { flex : 1 });

         // ============================================================ //

         let titleContainer = genElem("hbox", { class : "gmml-popup-title-container" });

         let title = createDescription(ent.title, { class : "gmml-popup-title gmml-link" });
         titleContainer.appendChild(title);

         container.appendChild(titleContainer);

         // ============================================================ //

         let body = genElem("hbox");

         body.appendChild(createDescription(ent.summary));

         container.appendChild(body);

         // ============================================================ //

         cont.appendChild(container);

         container.addEventListener("click", function (ev) {
                                        if (ev.button !== 0)
                                            return;

                                        let target = ev.target;

                                        switch (target) {
                                        case body:
                                            break;
                                        case title:
                                            let (url = ent.link.@href) util.visitLink(url);
                                            break;
                                        }
                                    }, false);
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

             if (!(gmail = util.storage.gmail))
             {
                 gmail = util.storage.gmail = new Gmail(
                     {
                         // username : "foo@bar",
                         // password : "foobar"
                     }
                 );

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
