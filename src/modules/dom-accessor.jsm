/**
 * @fileOverview jQuery-like wrapper
 * @name dom-accessor.jsm
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

const EXPORTED_SYMBOLS = ["DOMAccessor"];

function DOMAccessor(doc) {
  if (!(this instanceof DOMAccessor))
    return new DOMAccessor(doc);

  this.doc = doc;
}

DOMAccessor.prototype = {
  // Selectors
  select: function (query) {
    return new DOMAccessor(this.doc.querySelector(query));
  },
  selectAll: function (query) {
    return Array.slice(this.doc.querySelectorAll(query)).map(DOMAccessor);
  },

  // Get wrapped value
  get text() {
    return this.doc.textContent;
  },
  attr: function (attrName) {
    return this.doc.getAttribute(attrName);
  },

  // Overrides
  valueOf: function () {
    return this.text;
  },
  toString: function () {
    return this.text;
  }
};
