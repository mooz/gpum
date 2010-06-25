#!/usr/bin/zsh

setopt extended_glob
setopt nonomatch

## ================================ ##

# create jar file
rm -f chrome/gmml.jar
jar cv0f chrome/gmml.jar \
    content/*.{js,xul}~(*~|.svn/*) \
    locale/**/*~(*~|.svn/*) \
    skin/**/*.*~(*~|*.svg|.svn/*)

# create xpi file
rm -f gmml.xpi
zip -r -9 gmml.xpi \
    chrome/gmml.jar \
    defaults/**/*.*~(*~|.svn/*) \
    install.rdf \
    modules/*.jsm~(*~|.svn/*)
cp chrome.manifest.pack /tmp/chrome.manifest
zip -j -9 gmml.xpi /tmp/chrome.manifest
