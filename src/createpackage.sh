#!/usr/bin/zsh

setopt extended_glob
setopt nonomatch

## ================================ ##

# create jar file
[[ -d chrome ]] || mkdir chrome

rm -f chrome/gpum.jar
zip -r -0 chrome/gpum.jar \
    content/**/*.{js,xul,css,png,gif}~(*~|.svn/*) \
    locale/**/*~(*~|.svn/*) \
    skin/**/*.*~(*~|.svn/*)

# create xpi file
rm -f gpum.xpi
zip -r -9 gpum.xpi \
    chrome/gpum.jar \
    defaults/**/*.*~(*~|.svn/*) \
    install.rdf \
    modules/*.jsm~(*~|.svn/*)
cp chrome.manifest.pack /tmp/chrome.manifest
zip -j -9 gpum.xpi /tmp/chrome.manifest
