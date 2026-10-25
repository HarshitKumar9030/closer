#!/usr/bin/env python3
"""Build a small native APK using Android SDK tools; no Gradle dependencies."""
import argparse, os, pathlib, subprocess, shutil, zipfile
parser=argparse.ArgumentParser();parser.add_argument('--release',action='store_true');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent
sdk=pathlib.Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or str(pathlib.Path.home()/'Library/Android/sdk'))
default_java=pathlib.Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
java=pathlib.Path(os.environ['JAVA_HOME']) if os.environ.get('JAVA_HOME') else default_java if default_java.exists() else pathlib.Path(shutil.which('javac') or '/missing/javac').resolve().parent.parent
if not (sdk/'build-tools').is_dir():parser.error('Set ANDROID_HOME to an installed Android SDK (API 36+).')
if not (java/'bin/javac').is_file():parser.error('Set JAVA_HOME to an installed JDK.')
if args.release:
 for name in ['ANDROID_KEYSTORE','ANDROID_KEY_ALIAS','ANDROID_KEYSTORE_PASSWORD']:
  if not os.environ.get(name):parser.error('Release signing requires '+name)
 keystore=pathlib.Path(os.environ['ANDROID_KEYSTORE']).expanduser().resolve()
 if not keystore.is_file():parser.error('ANDROID_KEYSTORE does not point to a keystore file.')
tools=sorted((sdk/'build-tools').glob('*'),key=lambda p:[int(x) if x.isdigit() else 0 for x in p.name.split('.')])[-1]
platforms=sorted((sdk/'platforms').glob('android-*'),key=lambda p:int(p.name.split('-')[1].split('.')[0]))
if not platforms or int(platforms[-1].name.split('-')[1].split('.')[0])<36:parser.error('Install Android SDK API 36 or higher.')
platform=platforms[-1]/'android.jar'
build=root/'build';shutil.rmtree(build,ignore_errors=True);(build/'classes').mkdir(parents=True);(build/'generated').mkdir();(build/'dex').mkdir()
env={**os.environ,'JAVA_HOME':str(java),'PATH':str(java/'bin')+os.pathsep+os.environ['PATH']}
def run(*command):subprocess.run([str(x) for x in command],check=True,env=env,cwd=root)
run(tools/'aapt2','compile','--dir',root/'res','-o',build/'resources.zip')
run(tools/'aapt2','link','-o',build/'unsigned.apk','--manifest',root/'AndroidManifest.xml','-I',platform,'--java',build/'generated',build/'resources.zip')
sources=list((root/'src').rglob('*.java'))+list((build/'generated').rglob('*.java'))
run(java/'bin/javac','-source','8','-target','8','-Xlint:-options','-classpath',platform,'-d',build/'classes',*sources)
run(tools/'d8','--min-api','29','--lib',platform,'--output',build/'dex',*list((build/'classes').rglob('*.class')))
with zipfile.ZipFile(build/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as apk:apk.write(build/'dex/classes.dex','classes.dex')
run(tools/'zipalign','-f','4',build/'unsigned.apk',build/'aligned.apk')
if args.release:
 output=build/'closer-release.apk'
 signing=['--ks',keystore,'--ks-key-alias',os.environ['ANDROID_KEY_ALIAS'],'--ks-pass','env:ANDROID_KEYSTORE_PASSWORD','--key-pass','env:ANDROID_KEY_PASSWORD' if os.environ.get('ANDROID_KEY_PASSWORD') else 'env:ANDROID_KEYSTORE_PASSWORD']
else:
 keys=root/'.keys';keys.mkdir(exist_ok=True);keystore=keys/'debug.keystore'
 if not keystore.exists():run(java/'bin/keytool','-genkeypair','-keystore',keystore,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=Closer,C=US')
 output=build/'closer-debug.apk';signing=['--ks',keystore,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android']
run(tools/'apksigner','sign',*signing,'--out',output,build/'aligned.apk')
run(tools/'apksigner','verify','--verbose',output)
print('Built:',output)
