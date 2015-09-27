#!/usr/bin/zsh

setopt extended_glob
setopt nonomatch

# create xpi file
rm -f gpum.xpi
zip -r -9 gpum.xpi \
    chrome.manifest \
    content/**/*.{js,xul,xml,css,png,gif}~(*~|.svn/*) \
    locale/**/*~(*~|.svn/*) \
    skin/**/*.*~(*~|.svn/*) \
    defaults/**/*.*~(*~|.svn/*) \
    install.rdf \
    modules/*.jsm~(*~|.svn/*)
