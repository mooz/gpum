#!/usr/bin/zsh

setopt extended_glob
setopt nonomatch

## ================================ ##

# create jar file
rm -f chrome/gpum.jar
jar cv0f chrome/gpum.jar \
    content/*.{js,xul}~(*~|.svn/*) \
    locale/**/*~(*~|.svn/*) \
    skin/**/*.*~(*~|*.svg|.svn/*)

# create xpi file
rm -f gpum.xpi
zip -r -9 gpum.xpi \
    chrome/gpum.jar \
    defaults/**/*.*~(*~|.svn/*) \
    install.rdf \
    modules/*.jsm~(*~|.svn/*)
cp chrome.manifest.pack /tmp/chrome.manifest
zip -j -9 gpum.xpi /tmp/chrome.manifest
