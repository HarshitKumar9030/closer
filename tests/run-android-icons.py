#!/usr/bin/env python3
"""Run against an already booted test emulator. Builds and installs a test-only APK."""
import os, pathlib, subprocess, shutil, zipfile
root=pathlib.Path(__file__).resolve().parent.parent
sdk=pathlib.Path(os.environ.get('ANDROID_HOME',str(pathlib.Path.home()/'Library/Android/sdk')))
java=pathlib.Path(os.environ.get('JAVA_HOME','/Applications/Android Studio.app/Contents/jbr/Contents/Home'))
tools=sorted((sdk/'build-tools').iterdir(),key=lambda p:[int(v) if v.isdigit() else 0 for v in p.name.split('.')])[-1]
platform=sorted((sdk/'platforms').glob('android-*'),key=lambda p:int(p.name.split('-')[1].split('.')[0]))[-1]/'android.jar'
build=root/'artifacts/android-icon-tests';shutil.rmtree(build,ignore_errors=True);(build/'classes').mkdir(parents=True);(build/'dex').mkdir()
env={**os.environ,'JAVA_HOME':str(java),'PATH':str(java/'bin')+os.pathsep+os.environ['PATH']}
def run(*args):subprocess.run([str(a) for a in args],check=True,env=env,cwd=root)
manifest=build/'AndroidManifest.xml';manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="app.closer.phone.tests"><uses-sdk android:minSdkVersion="29" android:targetSdkVersion="36"/><application android:label="Closer icon tests"/><instrumentation android:name=".IconInstrumentation" android:targetPackage="app.closer.phone"/></manifest>')
run(tools/'aapt2','link','-o',build/'unsigned.apk','--manifest',manifest,'-I',platform)
run(java/'bin/javac','-source','8','-target','8','-Xlint:-options','-classpath',platform,'-d',build/'classes',root/'tests/IconInstrumentation.java')
run(tools/'d8','--min-api','29','--lib',platform,'--output',build/'dex',*list((build/'classes').rglob('*.class')))
with zipfile.ZipFile(build/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as apk:apk.write(build/'dex/classes.dex','classes.dex')
run(tools/'zipalign','-f','4',build/'unsigned.apk',build/'aligned.apk')
run(tools/'apksigner','sign','--ks',root/'android/.keys/debug.keystore','--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',build/'test.apk',build/'aligned.apk')
adb=sdk/'platform-tools/adb'
run(adb,'-e','install','-r',root/'android/build/closer-debug.apk');run(adb,'-e','install','-r',build/'test.apk')
result=subprocess.check_output([str(adb),'-e','shell','am','instrument','-w','app.closer.phone.tests/.IconInstrumentation'],env=env,text=True);print(result)
if 'iconTest=passed:' not in result:raise SystemExit('Android icon instrumentation failed')
