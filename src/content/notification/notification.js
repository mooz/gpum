var Notification = (function () {
    const Cc = Components.classes;
    const Ci = Components.interfaces;

    function loadScript(path, context) {
        Cc["@mozilla.org/moz/jssubscript-loader;1"]
            .getService(Ci.mozIJSSubScriptLoader)
            .loadSubScript(path, context);
    }

    function loadModule(name, context) {
        let path = "resource://gpum-modules/" + name;

        try {
            if (name.lastIndexOf(".jsm") !== -1)
                Components.utils.import(path, context);
            else
                loadScript(path, context);
        } catch (x) {}

        return context;
    }

    let { util } = loadModule("util.jsm", {});

    function $(id) document.getElementById(id);

    function Timer(callback, duration) {
        var self = this;

        this.duration = duration;
        this.elapsed  = 0;
        this.timer    = null;
        this.callback = function () {
            this.finished = true;
            try {
                callback();
            } catch (x) {}
        };
    }

    Timer.prototype = {
        start: function () {
            this.ensureNotFinished();
            if (this.timer)
                throw new Error("Timer already started");

            this.startTime = Date.now();
            this.startTimeout(this.duration);
        },

        resume: function () {
            this.ensureNotFinished();
            if (this.timer)
                throw new Error("Timer is running");

            var remains = Math.max(this.duration - this.elapsed, 0);

            this.startTimeout(remains);
        },

        suspend: function () {
            this.ensureNotFinished();
            if (!this.timer)
                throw new Error("Timer is not running");

            this.elapsed += Date.now() - this.lastCheckpoint;
            this.stop();
        },

        stop: function () {
            if (this.timer)
                clearTimeout(this.timer);
            this.timer = null;
        },

        checkpoint: function () {
            this.lastCheckpoint = Date.now();
        },

        startTimeout: function (msec) {
            this.checkpoint();
            this.timer = setTimeout(this.callback, msec);
        },

        ensureNotFinished: function () {
            if (this.finished)
                throw new Error("Timer has finished");
        }
    };

    var self = {
        timer: null,
        duration: 3000,

        get container() $("notification-container"),
        get imageElement() $("notification-image"),
        get titleElement() $("notification-title"),
        get messageContainerElement() $("notification-message-container"),
        get bodyElement() $("notification-body"),

        beforeOnLoad: function () {
            let context = window.arguments[0];
            self.context = context;

            if (context.duration)
                self.duration = context.duration;

            if (context.icon)
                self.imageElement.src = context.icon;

            if (context.title)
                self.titleElement.appendChild(document.createTextNode(context.title));

            if (context.xml) {
                self.messageContainerElement.appendChild(self.xmlToDom(context.xml));
            } else if (context.text) {
                self.messageContainerElement.appendChild(
                    self.createTextFragment(context.text.split("\n"))
                );
            }

            if (context.onClick) {
                self.messageContainerElement.addEventListener("click", function (ev) {
                    context.onClick(ev);
                }, false);
            }
        },

        onLoad: function () {
            this.fixSize();

            let x = (screen.availLeft + screen.availWidth - window.outerWidth) - 10;
            let y = screen.availTop + screen.availHeight - window.outerHeight - 10;

            window.moveTo(x, y);

            self.timer = new Timer(self.close, self.duration);
            self.timer.start();
        },

        fixSize: function () {
            window.sizeToContent();

            let { maxWidth, maxHeight } = self.context;
            let { outerWidth: width, outerHeight: height } = window;

            if (maxWidth && maxWidth > 0 && window.outerWidth > maxWidth)
                width = maxWidth;

            if (maxHeight && maxHeight > 0 && window.outerHeight > maxHeight)
                height = maxHeight;

            window.resizeTo(width, height);
        },

        onLockButtonClick: function (ev) {
            if (ev.button)
                return;

            this.locked = !this.locked;
        },

        set locked(status) {
            let { container } = self;

            if (status)
                container.setAttribute("data-locked", "true");
            else
                container.removeAttribute("data-locked");

            if (self.locked)
                self.timer.resume();
            else
                self.timer.suspend();
        },

        get locked() {
            let { container } = self;
            return container.getAttribute("data-checked") === "true";
        },

        onCloseButtonClick: function (ev) {
            if (ev.button)
                return;
            self.close();
        },

        close: function (ev) {
            let { onClose } = self.context;

            if (typeof onClose === "function") {
                try {
                    onClose();
                } catch ([]) {}
            }

            window.close();
        },

        onMouseOver: function (ev) {
            if (ev.target !== self.container)
                return;

            // alert(ev);
            util.log("mouse over: " + ev.target.localName);

            self.locked = true;
        },

        onMouseOut: function (ev) {
            if (ev.target !== self.container)
                return;

            // alert(ev);
            util.log("mouse out: " + ev.target.localName);
            self.locked = false;
        },

        /**
         * Convert E4X to DOM object
         * Original code by piro (http://d.hatena.ne.jp/teramako/20081113/p1#c1226602807)
         * @param {} xml
         * @param {} xmlns
         * @returns {}
         */
        xmlToDom:
        function xmlToDom(xml) {
            let docElem = (new DOMParser).parseFromString(
                '<root xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">'
                    + xml.toXMLString()
                    + "</root>", "application/xml"
            ).documentElement;

            let imported = document.importNode(docElem, true);

            let range = document.createRange();
            range.selectNodeContents(imported);
            let fragment = range.extractContents();
            range.detach();

            return fragment.childNodes.length > 1 ? fragment : fragment.firstChild;
        },

        createTextFragment: function (texts) {
            let fragment = document.createDocumentFragment();
            texts.forEach(function (text) {
                let textElement = document.createElement("description");
                textElement.appendChild(document.createTextNode(text));
                fragment.appendChild(textElement);
            });
            return fragment;
        }
    };

    return self;
})();
